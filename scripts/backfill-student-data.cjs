const admin = require('firebase-admin');

const APPLY_CHANGES = process.argv.includes('--apply');
const PAGE_SIZE = 500;
const BATCH_SIZE = 400;

admin.initializeApp();
const database = admin.firestore();

const normalizeText = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const addPrefixes = (target, value) => {
  for (let length = 2; length <= Math.min(value.length, 24); length += 1) {
    target.add(value.slice(0, length));
  }
};

const buildSearchTokens = (fields) => {
  const tokens = new Set();

  fields.filter(Boolean).forEach((field) => {
    const normalized = normalizeText(field);
    if (normalized.length >= 2) addPrefixes(tokens, normalized);
    const words = normalized.split(' ').filter((word) => word.length >= 2);
    words.forEach((word) => addPrefixes(tokens, word));
    const acronym = words.map((word) => word[0]).join('');
    if (acronym.length >= 2) addPrefixes(tokens, acronym);
  });

  return [...tokens].slice(0, 200);
};

const sameStringArray = (left, right) => (
  Array.isArray(left)
  && left.length === right.length
  && left.every((value, index) => value === right[index])
);

let batch = database.batch();
let pendingWrites = 0;
let committedWrites = 0;

const flushBatch = async () => {
  if (!APPLY_CHANGES || pendingWrites === 0) return;
  await batch.commit();
  committedWrites += pendingWrites;
  batch = database.batch();
  pendingWrites = 0;
};

const queueMerge = async (reference, data) => {
  if (!APPLY_CHANGES) return;
  batch.set(reference, data, { merge: true });
  pendingWrites += 1;
  if (pendingWrites >= BATCH_SIZE) await flushBatch();
};

const forEachDocument = async (collectionName, callback) => {
  let cursor = null;

  while (true) {
    let request = database.collection(collectionName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (cursor) request = request.startAfter(cursor);

    const snapshot = await request.get();
    for (const document of snapshot.docs) await callback(document);

    if (snapshot.size < PAGE_SIZE) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
};

const run = async () => {
  let scannedProfiles = 0;
  let changedProfiles = 0;
  let scannedBlocks = 0;
  let migratedBlockEdges = 0;
  let purgedLegacyLocations = 0;
  const queuedBlockIds = new Set();

  await forEachDocument('profiles', async (profileDocument) => {
    scannedProfiles += 1;
    const profile = profileDocument.data();
    const searchTokens = buildSearchTokens([
      profile.fullName,
      profile.nickname,
      profile.major,
      profile.className,
      profile.academicYear,
      profile.university,
      profile.campus,
    ]);
    const majorNormalized = normalizeText(profile.major);
    const updates = {};

    if (!sameStringArray(profile.searchTokens, searchTokens)) updates.searchTokens = searchTokens;
    if (majorNormalized && profile.majorNormalized !== majorNormalized) {
      updates.majorNormalized = majorNormalized;
    }
    if (profile.location !== undefined || profile.showLocation === true) {
      updates.location = admin.firestore.FieldValue.delete();
      updates.showLocation = false;
      purgedLegacyLocations += 1;
    }

    if (Object.keys(updates).length > 0) {
      changedProfiles += 1;
      await queueMerge(profileDocument.ref, updates);
    }
  });

  await forEachDocument('blocks', async (blockDocument) => {
    scannedBlocks += 1;
    const block = blockDocument.data();
    if (!block.blockerUid || !block.blockedUid || block.blockerUid === block.blockedUid) return;

    const canonicalId = `${block.blockerUid}_${block.blockedUid}`;
    if (blockDocument.id === canonicalId || queuedBlockIds.has(canonicalId)) return;

    queuedBlockIds.add(canonicalId);
    migratedBlockEdges += 1;
    await queueMerge(database.collection('blocks').doc(canonicalId), {
      blockerUid: block.blockerUid,
      blockedUid: block.blockedUid,
      createdAt: block.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await flushBatch();

  console.log(JSON.stringify({
    mode: APPLY_CHANGES ? 'apply' : 'dry-run',
    scannedProfiles,
    changedProfiles,
    scannedBlocks,
    migratedBlockEdges,
    purgedLegacyLocations,
    committedWrites,
  }, null, 2));

  if (!APPLY_CHANGES) {
    console.log('Dry run only. Re-run with --apply after reviewing these counts.');
  }
};

run().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
