const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Send push notification when new message is created
 * Trigger: Firestore onCreate for conversations/{conversationId}/messages/{messageId}
 */
exports.sendMessageNotification = functions.firestore
  .document('conversations/{conversationId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    try {
      const message = snap.data();
      const { conversationId, messageId } = context.params;
      
      console.log('📬 New message:', messageId, 'in conversation:', conversationId);
      
      // Get conversation to find recipient
      const conversationRef = admin.firestore()
        .collection('conversations')
        .doc(conversationId);
      
      const conversationSnap = await conversationRef.get();
      
      if (!conversationSnap.exists) {
        console.log('❌ Conversation not found');
        return null;
      }
      
      const conversation = conversationSnap.data();
      const participants = conversation.participants || [];
      
      // Find recipient (not sender)
      const recipientId = participants.find(id => id !== message.senderId);
      
      if (!recipientId) {
        console.log('❌ No recipient found');
        return null;
      }
      
      console.log('👤 Recipient:', recipientId);
      
      // Get sender info
      const senderSnap = await admin.firestore()
        .collection('users')
        .doc(message.senderId)
        .get();
      
      if (!senderSnap.exists) {
        console.log('❌ Sender not found');
        return null;
      }
      
      const sender = senderSnap.data();
      const senderName = sender.displayName || sender.name || 'Người dùng TVU Connect';
      const senderAvatar = sender.photoURL || sender.avatar || 'https://via.placeholder.com/150';
      
      console.log('👤 Sender:', senderName);
      
      // Get recipient's FCM tokens
      const tokensSnap = await admin.firestore()
        .collection('users')
        .doc(recipientId)
        .collection('fcmTokens')
        .where('deleted', '==', false)
        .get();
      
      if (tokensSnap.empty) {
        console.log('❌ No FCM tokens found for recipient');
        return null;
      }
      
      const tokens = tokensSnap.docs.map(doc => doc.data().token);
      console.log('📱 Found', tokens.length, 'device(s)');
      
      // Truncate message to 100 chars
      const messageText = message.text || '';
      const truncatedText = messageText.length > 100 
        ? messageText.substring(0, 100) + '...' 
        : messageText;
      
      // Prepare notification payload
      const payload = {
        notification: {
          title: senderName,
          body: truncatedText,
          icon: senderAvatar,
          badge: 'https://tvu-connect.vercel.app/logo.png',
          click_action: `https://tvu-connect.vercel.app/messages?chat=${conversationId}`
        },
        data: {
          type: 'message',
          conversationId: conversationId,
          senderId: message.senderId,
          messageId: messageId,
          timestamp: message.createdAt ? message.createdAt.toMillis().toString() : Date.now().toString()
        }
      };
      
      // Send to all tokens
      const response = await admin.messaging().sendToDevice(tokens, payload, {
        priority: 'high',
        timeToLive: 60 * 60 * 24, // 24 hours
        contentAvailable: true
      });
      
      console.log('✅ Notifications sent:', response.successCount, 'success,', response.failureCount, 'failed');
      
      // Clean up invalid tokens
      const tokensToRemove = [];
      response.results.forEach((result, index) => {
        const error = result.error;
        if (error) {
          console.error('❌ Error sending to token:', tokens[index].substring(0, 20) + '...', error.code);
          
          if (error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered') {
            tokensToRemove.push(tokens[index]);
          }
        }
      });
      
      // Remove invalid tokens
      if (tokensToRemove.length > 0) {
        const batch = admin.firestore().batch();
        tokensToRemove.forEach(token => {
          const tokenRef = admin.firestore()
            .collection('users')
            .doc(recipientId)
            .collection('fcmTokens')
            .doc(token);
          batch.delete(tokenRef);
        });
        await batch.commit();
        console.log('🗑️ Removed', tokensToRemove.length, 'invalid token(s)');
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error sending notification:', error);
      return null;
    }
  });
