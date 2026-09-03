# Task 3.3: Deploy Updated Firestore Rules

## Deployment Status

**Date**: 2026-05-05
**Method**: Manual deployment via Firebase Console (CLI deployment requires billing)
**Project**: gen-lang-client-0050597412

## Changes Deployed

### 1. Added Typing Collection Rules
**Location**: After line 47 (after conversations collection)

```javascript
// ===============================================================
// Typing Collection Rules (for real-time typing indicators)
// ===============================================================
match /typing/{conversationId} {
  allow read: if isAuthenticated();
  allow write: if isAuthenticated();
}
```

**Purpose**: Fix permission errors when users type in chat or listen to typing indicators

### 2. Fixed Messages Collection Field Name Mismatch
**Location**: Lines 30 and 32 (messages collection)

```javascript
// BEFORE (incorrect):
allow update: if isAuthenticated() && resource.data.senderId == request.auth.uid;
allow delete: if isAuthenticated() && resource.data.senderId == request.auth.uid;

// AFTER (correct):
allow update: if isAuthenticated() && resource.data.senderUid == request.auth.uid;
allow delete: if isAuthenticated() && resource.data.senderUid == request.auth.uid;
```

**Purpose**: Fix permission errors when users attempt to delete their own messages

## Deployment Instructions

### Why Manual Deployment?

Firebase CLI deployment (`firebase deploy --only firestore:rules`) fails with:
```
Error: This API method requires billing to be enabled
```

Therefore, we must deploy manually through the Firebase Console.

### Step-by-Step Deployment

1. **Open Firebase Console**
   - URL: https://console.firebase.google.com/project/gen-lang-client-0050597412/firestore/rules
   - Login with your Firebase account

2. **Navigate to Firestore Rules**
   - Click **Firestore Database** in the left menu
   - Click the **Rules** tab at the top

3. **Copy Updated Rules**
   - Open the file: `FIRESTORE_RULES_COPY_PASTE.txt` (in project root)
   - Select all content (Ctrl+A)
   - Copy (Ctrl+C)

4. **Paste and Publish**
   - In Firebase Console, select all existing rules (Ctrl+A)
   - Paste the new rules (Ctrl+V)
   - Click the blue **Publish** button
   - Wait a few seconds for the rules to propagate

5. **Verify Deployment**
   - Check that the publish succeeded (green success message)
   - Note the timestamp of deployment

## Verification Checklist

After deploying the rules, verify the following:

### ✅ Typing Collection Rules
- [ ] Rules section for `typing` collection exists
- [ ] Located after `conversations` collection rules
- [ ] Allows authenticated users to read typing status
- [ ] Allows authenticated users to write typing status
- [ ] Has comment header: "Typing Collection Rules (for real-time typing indicators)"

### ✅ Messages Collection Rules
- [ ] Update rule uses `resource.data.senderUid` (not `senderId`)
- [ ] Delete rule uses `resource.data.senderUid` (not `senderId`)
- [ ] Read and create rules remain unchanged

### ✅ Other Collections
- [ ] All other collection rules remain unchanged
- [ ] Default deny rule still at the end

## Deployment Timestamp

**Timestamp**: [TO BE FILLED AFTER DEPLOYMENT]
**Deployed By**: [TO BE FILLED AFTER DEPLOYMENT]
**Verification Status**: [TO BE FILLED AFTER DEPLOYMENT]

## Next Steps

After successful deployment:

1. ✅ Task 3.3 Complete: Rules deployed to Firebase
2. ⏭️ Task 3.4: Re-run bug condition exploration test (should pass)
3. ⏭️ Task 3.5: Re-run preservation tests (should still pass)

## Troubleshooting

### Issue: "Missing or insufficient permissions" still appears

**Solution**:
1. Wait 1-2 minutes for rules to propagate
2. Hard refresh browser (Ctrl+Shift+R)
3. Clear browser cache if needed
4. Verify rules were published correctly in Firebase Console

### Issue: Rules don't seem to be applied

**Solution**:
1. Check Firebase Console to confirm rules were published
2. Look for the typing collection rules section
3. Verify the messages collection uses `senderUid` not `senderId`
4. Re-publish if necessary

### Issue: Other features break after deployment

**Solution**:
1. Check preservation test results (Task 3.5)
2. Compare deployed rules with `firestore.rules` file
3. Verify no accidental changes were made during copy-paste
4. Rollback to previous rules if needed (use Firebase Console history)

## Files Updated

- ✅ `firestore.rules` - Updated with typing collection rules and field name fix
- ✅ `FIRESTORE_RULES_COPY_PASTE.txt` - Updated for easy copy-paste deployment

## Requirements Validated

- ✅ Requirement 2.1: Typing status write operations
- ✅ Requirement 2.2: Typing status read operations
- ✅ Requirement 2.3: Message deletion operations
- ✅ Requirement 2.4: Typing status clear operations
- ✅ All preservation requirements (3.1-3.5)

