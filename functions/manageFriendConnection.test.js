const test = require('node:test');
const assert = require('node:assert/strict');
const { pairIdFor, requireFriendAction } = require('./manageFriendConnection');

test('friend pair id is deterministic in either direction', () => {
  assert.equal(pairIdFor('student-b', 'student-a'), 'student-a_student-b');
  assert.equal(pairIdFor('student-a', 'student-b'), 'student-a_student-b');
});

test('friend action trusts the authenticated uid, not client identity fields', () => {
  assert.deepEqual(requireFriendAction({
    auth: { uid: 'student-a' },
    data: { uid: 'spoofed', friendUid: 'student-b', action: 'send' },
  }), {
    uid: 'student-a',
    friendUid: 'student-b',
    action: 'send',
  });
});
