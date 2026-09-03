// Export all Cloud Functions
const sendMessageNotification = require('./sendMessageNotification');
const deleteOldPosts = require('./deleteOldPosts');

exports.sendMessageNotification = sendMessageNotification.sendMessageNotification;
exports.deleteOldPosts = deleteOldPosts.deleteOldPosts;
