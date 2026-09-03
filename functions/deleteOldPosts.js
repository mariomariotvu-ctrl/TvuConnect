/**
 * Cloud Function: Tự động xóa bài đăng sau 18 giờ
 * 
 * LƯU Ý: Cần Firebase Blaze Plan để sử dụng Cloud Functions
 * 
 * Cài đặt:
 * 1. npm install -g firebase-tools
 * 2. firebase init functions
 * 3. Copy code này vào functions/index.js
 * 4. firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Scheduled function chạy mỗi giờ để xóa bài đăng cũ
 * Chạy lúc: Mỗi giờ vào phút thứ 0
 */
exports.deleteOldPosts = functions.pubsub
  .schedule('0 * * * *') // Chạy mỗi giờ
  .timeZone('Asia/Ho_Chi_Minh')
  .onRun(async (context) => {
    console.log('Starting deleteOldPosts function...');

    try {
      // Tính thời gian 18 giờ trước
      const now = admin.firestore.Timestamp.now();
      const eighteenHoursAgo = new Date(now.toDate().getTime() - 18 * 60 * 60 * 1000);
      const cutoffTimestamp = admin.firestore.Timestamp.fromDate(eighteenHoursAgo);

      console.log(`Deleting posts older than: ${eighteenHoursAgo.toISOString()}`);

      // Query bài đăng cũ hơn 18 giờ
      const oldPostsQuery = db.collection('posts')
        .where('createdAt', '<', cutoffTimestamp)
        .limit(500); // Xóa tối đa 500 bài mỗi lần chạy

      const snapshot = await oldPostsQuery.get();

      if (snapshot.empty) {
        console.log('No old posts to delete');
        return null;
      }

      console.log(`Found ${snapshot.size} old posts to delete`);

      // Batch delete để tối ưu performance
      const batch = db.batch();
      let deleteCount = 0;

      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
        console.log(`Queued for deletion: ${doc.id}`);
      });

      // Commit batch delete
      await batch.commit();
      console.log(`Successfully deleted ${deleteCount} old posts`);

      return {
        success: true,
        deletedCount: deleteCount,
        timestamp: now.toDate().toISOString()
      };

    } catch (error) {
      console.error('Error deleting old posts:', error);
      throw error;
    }
  });

/**
 * HTTP Trigger version - Có thể gọi thủ công
 * URL: https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/deleteOldPostsManual
 */
exports.deleteOldPostsManual = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const now = admin.firestore.Timestamp.now();
    const eighteenHoursAgo = new Date(now.toDate().getTime() - 18 * 60 * 60 * 1000);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(eighteenHoursAgo);

    const oldPostsQuery = db.collection('posts')
      .where('createdAt', '<', cutoffTimestamp)
      .limit(500);

    const snapshot = await oldPostsQuery.get();

    if (snapshot.empty) {
      res.status(200).json({
        success: true,
        message: 'No old posts to delete',
        deletedCount: 0
      });
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${snapshot.size} old posts`,
      deletedCount: snapshot.size,
      timestamp: now.toDate().toISOString()
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Firestore Trigger - Tự động xóa khi bài đăng được tạo
 * Sử dụng TTL (Time To Live) policy
 */
exports.schedulePostDeletion = functions.firestore
  .document('posts/{postId}')
  .onCreate(async (snap, context) => {
    const postData = snap.data();
    const postId = context.params.postId;

    // Tính thời gian xóa (18 giờ sau khi tạo)
    const createdAt = postData.createdAt.toDate();
    const deleteAt = new Date(createdAt.getTime() + 18 * 60 * 60 * 1000);

    console.log(`Post ${postId} will be deleted at: ${deleteAt.toISOString()}`);

    // Lưu thông tin xóa vào metadata
    await snap.ref.update({
      deleteAt: admin.firestore.Timestamp.fromDate(deleteAt),
      autoDelete: true
    });

    return null;
  });
