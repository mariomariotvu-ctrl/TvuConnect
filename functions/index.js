// Export all Cloud Functions. App Check starts in monitor mode so the current
// production bundle keeps working; set ENFORCE_APP_CHECK=true only after the
// App Check-enabled web build has been released and valid traffic is visible.
const { setGlobalOptions } = require('firebase-functions/v2');
const APP_CHECK_ENFORCEMENT_ENABLED = false;

setGlobalOptions({ enforceAppCheck: APP_CHECK_ENFORCEMENT_ENABLED });

const sendMessageNotification = require('./sendMessageNotification');
const sendCallNotification = require('./sendCallNotification');
const askStudentAssistant = require('./askStudentAssistant');
const matchVoicePartner = require('./matchVoicePartner');
const manageStudyRoom = require('./manageStudyRoom');
const recordDatingDecision = require('./recordDatingDecision');
const manageDirectCall = require('./manageDirectCall');
const manageFriendConnection = require('./manageFriendConnection');
const manageLiveLocation = require('./manageLiveLocation');
const discoverFoodPlaces = require('./discoverFoodPlaces');
const deleteOldPosts = require('./deleteOldPosts');
const getStudentRoute = require('./getStudentRoute');
const getMapRoute = require('./getMapRoute');
const announceNewProfile = require('./announceNewProfile');
const sendCommentNotification = require('./sendCommentNotification');
const syncCommentCounters = require('./syncCommentCounters');
const deleteStudentAccount = require('./deleteStudentAccount');
const getTurnIceServers = require('./getTurnIceServers');
const searchAcademicMaterials = require('./searchAcademicMaterials');
const maintenanceTasks = require('./maintenanceTasks');

exports.sendMessageNotification = sendMessageNotification.sendMessageNotification;
exports.sendCallNotification = sendCallNotification.sendCallNotification;
exports.askStudentAssistant = askStudentAssistant.askStudentAssistant;
exports.matchVoicePartner = matchVoicePartner.matchVoicePartner;
exports.joinStudyRoom = manageStudyRoom.joinStudyRoom;
exports.leaveStudyRoom = manageStudyRoom.leaveStudyRoom;
exports.removeStudyRoomParticipant = manageStudyRoom.removeStudyRoomParticipant;
exports.recordDatingDecision = recordDatingDecision.recordDatingDecision;
exports.createDirectCall = manageDirectCall.createDirectCall;
exports.releaseDirectCallLocks = manageDirectCall.releaseDirectCallLocks;
exports.manageFriendConnection = manageFriendConnection.manageFriendConnection;
exports.updateLiveLocation = manageLiveLocation.updateLiveLocation;
exports.stopLiveLocation = manageLiveLocation.stopLiveLocation;
exports.getVisibleStudentLocations = manageLiveLocation.getVisibleStudentLocations;
exports.deleteExpiredLiveLocations = manageLiveLocation.deleteExpiredLiveLocations;
exports.discoverFoodPlaces = discoverFoodPlaces.discoverFoodPlaces;
exports.deleteOldPosts = deleteOldPosts.deleteOldPosts;
exports.getStudentRoute = getStudentRoute.getStudentRoute;
exports.getMapRoute = getMapRoute.getMapRoute;
exports.announceNewProfile = announceNewProfile.announceNewProfile;
exports.sendCommentNotification = sendCommentNotification.sendCommentNotification;
exports.syncCommentCounters = syncCommentCounters.syncCommentCounters;
exports.deleteStudentAccount = deleteStudentAccount.deleteStudentAccount;
exports.getTurnIceServers = getTurnIceServers.getTurnIceServers;
exports.searchAcademicMaterials = searchAcademicMaterials.searchAcademicMaterials;
exports.deleteExpiredDocumentsTask = maintenanceTasks.deleteExpiredDocumentsTask;
exports.scheduleFirebaseMaintenance = maintenanceTasks.scheduleFirebaseMaintenance;
