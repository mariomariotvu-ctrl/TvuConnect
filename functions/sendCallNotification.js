const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { sendDataNotification } = require('./notificationHelpers');

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

      const result = await sendDataNotification(call.calleeUid, {
        type: 'call',
        callId: event.params.callId,
        callerUid: call.callerUid,
        callerName,
        kind: call.kind === 'video' ? 'video' : 'audio',
      });
      console.log('Call notification sent', { callId: event.params.callId, ...result });
    } catch (error) {
      console.error('Could not send call notification:', error);
    }

    return null;
  });
