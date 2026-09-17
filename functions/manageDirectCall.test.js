const test = require('node:test');
const assert = require('node:assert/strict');
const {
  lockStillActive,
  normalizeOffer,
} = require('./manageDirectCall');

const snapshot = (data, exists = true) => ({ exists, data: () => data });

test('normalizes a valid WebRTC offer without accepting extra fields', () => {
  assert.deepEqual(normalizeOffer({ type: 'offer', sdp: 'v=0', ignored: true }), {
    type: 'offer',
    sdp: 'v=0',
  });
});

test('rejects malformed or oversized WebRTC offers', () => {
  assert.throws(() => normalizeOffer({ type: 'answer', sdp: 'v=0' }));
  assert.throws(() => normalizeOffer({ type: 'offer', sdp: 'x'.repeat(120_001) }));
});

test('busy lock requires both a live expiry and an active call', () => {
  const now = 1_000;
  const activeLock = snapshot({ expiresAt: { toMillis: () => now + 1 } });
  const expiredLock = snapshot({ expiresAt: { toMillis: () => now - 1 } });
  assert.equal(lockStillActive(activeLock, snapshot({ status: 'ringing' }), now), true);
  assert.equal(lockStillActive(activeLock, snapshot({ status: 'ended' }), now), false);
  assert.equal(lockStillActive(expiredLock, snapshot({ status: 'active' }), now), false);
});
