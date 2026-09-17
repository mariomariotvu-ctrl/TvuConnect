const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');
const { sendDataNotification } = require('./notificationHelpers');

if (!getApps().length) {
  initializeApp();
}

const preview = (message) => {
  const content = message.type === 'audio'
    ? 'Tin nhắn thoại'
    : String(message.text || 'Bạn có tin nhắn mới');
  return content.length > 120 ? `${content.slice(0, 117)}...` : content;
};

const compareTimestamps = (left, right) => {
  const secondsDifference = Number(left?.seconds || 0) - Number(right?.seconds || 0);
  if (secondsDifference !== 0) return secondsDifference;
  return Number(left?.nanoseconds || 0) - Number(right?.nanoseconds || 0);
};

/**
 * The web client writes directly to /messages, not a conversations subcollection.
 * Listening to this canonical path fixes missing push notifications.
 */
exports.sendMessageNotification = onDocumentCreated('messages/{messageId}', async (event) => {
    const snapshot = event.data;
    if (!snapshot) return null;
    const messageId = event.params.messageId;
    const message = snapshot.data() || {};
    const senderUid = message.senderUid;
    const receiverUid = message.receiverUid;

    if (!senderUid || !receiverUid || senderUid === receiverUid) {
      console.log('Skip notification: invalid message participants', messageId);
      return null;
    }

    try {
      // Keep the latest conversation summary on the trusted server. The
      // timestamp comparison prevents slower concurrent writes from winning.
      const firestore = getFirestore();
      const conversationId = message.conversationId || [senderUid, receiverUid].sort().join('_');
      const conversationRef = firestore.collection('conversations').doc(conversationId);
      const messageCreatedAt = message.createdAt || Timestamp.now();
      let shouldSendNotification = false;
      await firestore.runTransaction(async (transaction) => {
        const [conversationSnapshot, currentMessageSnapshot] = await Promise.all([
          transaction.get(conversationRef),
          transaction.get(snapshot.ref),
        ]);
        const currentMessage = currentMessageSnapshot.data() || {};
        if (!currentMessage.notificationClaimedAt) {
          transaction.update(snapshot.ref, {
            notificationClaimedAt: FieldValue.serverTimestamp(),
          });
          shouldSendNotification = true;
        } else {
          shouldSendNotification = false;
        }

        const currentLastMessageAt = conversationSnapshot.data()?.lastMessageAt;
        const currentLastMessageId = conversationSnapshot.data()?.lastMessageId;
        if (
          currentLastMessageAt
          && (
            compareTimestamps(currentLastMessageAt, messageCreatedAt) > 0
            || (
              compareTimestamps(currentLastMessageAt, messageCreatedAt) === 0
              && String(currentLastMessageId || '') >= messageId
            )
          )
        ) return;

        transaction.set(conversationRef, {
          participants: [senderUid, receiverUid].sort(),
          lastMessage: preview(message),
          lastMessageAt: messageCreatedAt,
          lastMessageId: messageId,
        }, { merge: true });
      });

      if (!shouldSendNotification) {
        console.log('Skip duplicate notification delivery', messageId);
        return null;
      }

      const senderSnapshot = await firestore.collection('profiles').doc(senderUid).get();
      const sender = senderSnapshot.exists ? senderSnapshot.data() : {};
      const senderName = sender?.fullName || sender?.nickname || 'Sinh viên TVU';

      const result = await sendDataNotification(receiverUid, {
        type: 'message',
        conversationId,
        senderUid,
        senderName,
        messageId,
        body: preview(message),
      });

      console.log('Message notification sent', {
        messageId,
        receiverUid,
        ...result,
      });
    } catch (error) {
      // A notification failure must never fail the message write itself.
      console.error('Could not send message notification:', error);
    }

    return null;
  });
