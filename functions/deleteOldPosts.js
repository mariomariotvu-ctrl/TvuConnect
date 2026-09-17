const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp();
}

const RETENTION_HOURS = 18;
const DELETE_BATCH_SIZE = 500;

/** Delete temporary community posts after their 18-hour lifetime. */
exports.deleteOldPosts = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Asia/Ho_Chi_Minh',
    timeoutSeconds: 120,
  },
  async () => {
    const firestore = getFirestore();
    const now = Timestamp.now();
    const cutoff = Timestamp.fromMillis(
      now.toMillis() - RETENTION_HOURS * 60 * 60 * 1000,
    );
    const snapshot = await firestore.collection('posts')
      .where('createdAt', '<', cutoff)
      .limit(DELETE_BATCH_SIZE)
      .get();

    if (snapshot.empty) {
      console.log('No expired community posts to delete.');
      return;
    }

    const batch = firestore.batch();
    snapshot.docs.forEach((post) => batch.delete(post.ref));
    await batch.commit();
    console.log('Deleted expired community posts.', { count: snapshot.size });
  },
);
