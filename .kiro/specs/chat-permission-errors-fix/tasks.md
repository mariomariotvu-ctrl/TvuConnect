# Implementation Plan

## Overview

Bugfix lỗi permission trong Chat: (1) Collection `typing` thiếu Firestore security rules, gây permission-denied khi ghi/đọc typing indicator; (2) Rules cho messages dùng `senderId` thay vì `senderUid`, khiến message deletion bị từ chối dù người dùng là chủ tin nhắn.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Chat Permission Errors
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test typing status write operations fail with permission errors on unfixed rules
  - Test typing status read operations fail with permission errors on unfixed rules
  - Test message deletion fails with permission errors when senderUid matches but rules check senderId
  - The test assertions should match the Expected Behavior Properties from design (Properties 1 and 2)
  - Run test on UNFIXED firestore.rules
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Chat Functionality
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED rules for non-buggy inputs
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Test message sending continues to work (create operations)
  - Test message reading continues to work (read operations)
  - Test message read status updates continue to work (update operations)
  - Test unauthorized delete operations continue to be denied
  - Test operations on other collections remain unchanged
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED firestore.rules
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed rules
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix chat permission errors in firestore.rules

  - [x] 3.1 Add typing collection security rules
    - Add new rules section for `typing` collection after `conversations` collection rules (after line 47)
    - Allow authenticated users to read typing status for any conversation
    - Allow authenticated users to write typing status for conversations they participate in
    - Include comment header: "Typing Collection Rules (for real-time typing indicators)"
    - _Bug_Condition: isBugCondition(input) where input.collection == 'typing' AND input.operation IN ['read', 'write']_
    - _Expected_Behavior: Operations succeed without permission errors (Property 1 from design)_
    - _Preservation: All other collections' rules remain unchanged (Property 4 from design)_
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.2 Fix messages collection field name mismatch
    - Update line 30 in firestore.rules: change `resource.data.senderId` to `resource.data.senderUid` in update rule
    - Update line 32 in firestore.rules: change `resource.data.senderId` to `resource.data.senderUid` in delete rule
    - Keep all other message rules unchanged (read, create)
    - _Bug_Condition: isBugCondition(input) where input.collection == 'messages' AND input.operation == 'delete' AND input.userId == input.document.senderUid_
    - _Expected_Behavior: Delete operations succeed for message sender (Property 2 from design)_
    - _Preservation: Message send, read, and update operations remain unchanged (Property 3 from design)_
    - _Requirements: 2.3_

  - [x] 3.3 Deploy updated firestore.rules
    - Deploy the updated rules to Firebase using Firebase CLI or Console
    - Verify deployment succeeds without errors
    - Document deployment timestamp and method used
    - _Requirements: All_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Chat Permission Errors Fixed
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify typing status write operations succeed
    - Verify typing status read operations succeed
    - Verify message deletion succeeds when senderUid matches
    - _Requirements: Expected Behavior Properties 1 and 2 from design_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Chat Functionality Preserved
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm message sending still works
    - Confirm message reading still works
    - Confirm message read status updates still work
    - Confirm unauthorized operations still denied
    - Confirm other collections still work
    - _Requirements: Preservation Properties 3 and 4 from design_

- [x] 4. Checkpoint - Ensure all tests pass
  - Verify all bug condition tests pass (typing operations and message deletion work)
  - Verify all preservation tests pass (existing functionality unchanged)
  - Test in browser: open chat, type message, observe typing indicator, send message, delete message
  - Verify no permission errors in browser console
  - Ask user if questions arise or if additional testing is needed

## Notes

- File cần sửa: `firestore.rules`
- Cần deploy rules sau khi sửa: `firebase deploy --only firestore:rules`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3"] },
    { "id": 3, "tasks": ["3.4", "3.5"] },
    { "id": 4, "tasks": ["4"] }
  ]
}
```
