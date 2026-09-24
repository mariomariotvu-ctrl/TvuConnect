const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { deliverNotification } = require('./notificationHelpers');

if (!getApps().length) {
  initializeApp();
}

/** Notify a callee when the app is closed; the in-app listener handles open tabs. */
exports.sendCallNotification = onDocumentCreated('calls/{callId}', async (event) => {
    const snapshot = event.data;
    if (!snapshot) return null;
    const call = snapshot.data() || {};
    if (!call.callerUid || !call.calleeUid || call.status !== 'ringing') return null;

    try {
      const callerSnapshot = await getFirestore().collection('profiles').doc(call.callerUid).get();
      const caller = callerSnapshot.exists ? callerSnapshot.data() : {};
      const callerName = caller?.fullName || caller?.nickname || 'Sinh viên TVU';

      const isVideo = call.kind === 'video';
      const result = await deliverNotification(call.calleeUid, `call_${event.params.callId}`, {
        type: 'call',
        title: isVideo ? `Cuộc gọi video từ ${callerName}` : `Cuộc gọi thoại từ ${callerName}`,
        body: 'Bạn có một cuộc gọi đến.',
        actorUid: call.callerUid,
        actorName: callerName,
        actorPhotoURL: caller?.photoURL || null,
        entityId: event.params.callId,
        route: `/messages/${encodeURIComponent(call.callerUid)}`,
        storeInInbox: false,
        pushData: {
          callId: event.params.callId,
          callerUid: call.callerUid,
          callerName,
          kind: isVideo ? 'video' : 'audio',
        },
      });
      console.log('Call notification sent', { callId: event.params.callId, ...result });
    } catch (error) {
      console.error('Could not send call notification:', error);
    }

    return null;
  });
