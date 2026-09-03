# Bugfix Requirements Document

## Introduction

This bugfix addresses Firebase permission errors occurring in the Chat component that prevent users from:
- Clearing typing status indicators
- Listening to typing status updates
- Deleting their own messages

These errors are caused by missing Firestore security rules for the `typing` collection and a field name mismatch in the `messages` collection rules.

**Impact**: Users experience console errors and degraded functionality in the chat feature, including inability to delete messages and broken typing indicators.

**Root Cause Analysis**:
1. The `typing` collection has no security rules defined in `firestore.rules`
2. The `messages` collection rules check for `senderId` field, but the code uses `senderUid` field

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user types in the chat input THEN the system attempts to write to the `typing` collection and fails with "Missing or insufficient permissions" error

1.2 WHEN a user opens a chat conversation THEN the system attempts to listen to the `typing` collection and fails with "permission-denied" error

1.3 WHEN a user attempts to delete their own message THEN the system attempts to delete from the `messages` collection and fails with "Missing or insufficient permissions" error

1.4 WHEN the Chat component unmounts or user sends a message THEN the system attempts to clear typing status and fails with "Missing or insufficient permissions" error

### Expected Behavior (Correct)

2.1 WHEN a user types in the chat input THEN the system SHALL successfully write typing status to the `typing` collection without permission errors

2.2 WHEN a user opens a chat conversation THEN the system SHALL successfully listen to typing status updates from the `typing` collection without permission errors

2.3 WHEN a user attempts to delete their own message THEN the system SHALL successfully delete the message from the `messages` collection without permission errors

2.4 WHEN the Chat component unmounts or user sends a message THEN the system SHALL successfully clear typing status without permission errors

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user sends a message THEN the system SHALL CONTINUE TO create the message in the `messages` collection successfully

3.2 WHEN a user reads messages in a conversation THEN the system SHALL CONTINUE TO query messages from the `messages` collection successfully

3.3 WHEN a user attempts to delete another user's message THEN the system SHALL CONTINUE TO deny the deletion operation

3.4 WHEN an unauthenticated user attempts any operation THEN the system SHALL CONTINUE TO deny all operations

3.5 WHEN a user updates message read status THEN the system SHALL CONTINUE TO update the message successfully
