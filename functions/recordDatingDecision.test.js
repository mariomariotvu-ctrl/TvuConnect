const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isAdultDatingProfile,
  requireDatingRequest,
} = require('./recordDatingDecision');

test('dating request always uses the authenticated uid', () => {
  assert.deepEqual(requireDatingRequest({
    auth: { uid: 'student-a' },
    data: { fromUid: 'spoofed-user', toUid: 'student-b', action: 'like' },
  }), {
    fromUid: 'student-a',
    toUid: 'student-b',
    action: 'like',
  });
});

test('dating profile must explicitly opt in and be at least 18', () => {
  const snapshot = (data) => ({ exists: true, data: () => data });
  assert.equal(isAdultDatingProfile(snapshot({ datingEnabled: true, age: 18 })), true);
  assert.equal(isAdultDatingProfile(snapshot({ datingEnabled: true, age: 17 })), false);
  assert.equal(isAdultDatingProfile(snapshot({ datingEnabled: false, age: 24 })), false);
  assert.equal(isAdultDatingProfile(snapshot({ datingEnabled: true, age: '24' })), false);
});
