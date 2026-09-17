const admin = require('firebase-admin');
const { geohashForLocation } = require('geofire-common');

const APPLY_CHANGES = process.argv.includes('--apply');
const PAGE_SIZE = 500;
const BATCH_SIZE = 400;

admin.initializeApp();
const database = admin.firestore();

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

const run = async () => {
  let cursor = null;
  let scanned = 0;
  let missingLocation = 0;
  let changed = 0;

  while (true) {
    let request = database.collection('rentalPosts')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (cursor) request = request.startAfter(cursor);

    const snapshot = await request.get();
    for (const rentalDocument of snapshot.docs) {
      scanned += 1;
      const rental = rentalDocument.data();
      const lat = rental.location?.lat;
      const lng = rental.location?.lng;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        missingLocation += 1;
        continue;
      }

      const geohash = geohashForLocation([lat, lng]);
      if (rental.geohash === geohash) continue;

      changed += 1;
      if (APPLY_CHANGES) {
        batch.set(rentalDocument.ref, { geohash }, { merge: true });
        pendingWrites += 1;
        if (pendingWrites >= BATCH_SIZE) await flushBatch();
      }
    }

    if (snapshot.size < PAGE_SIZE) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  await flushBatch();
  console.log(JSON.stringify({
    mode: APPLY_CHANGES ? 'apply' : 'dry-run',
    scanned,
    changed,
    missingLocation,
    committedWrites,
  }, null, 2));

  if (!APPLY_CHANGES) {
    console.log('Dry run only. Re-run with --apply after reviewing these counts.');
  }
};

run().catch((error) => {
  console.error('Rental geohash migration failed:', error);
  process.exitCode = 1;
});
