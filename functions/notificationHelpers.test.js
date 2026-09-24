const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldStoreInInbox } = require('./notificationHelpers');

test('messages and calls stay out of the general notification inbox', () => {
  assert.equal(shouldStoreInInbox({ type: 'message' }), false);
  assert.equal(shouldStoreInInbox({ type: 'call' }), false);
});

test('social, discovery and community activity stays in the notification inbox', () => {
  assert.equal(shouldStoreInInbox({ type: 'friend_request' }), true);
  assert.equal(shouldStoreInInbox({ type: 'encounter' }), true);
  assert.equal(shouldStoreInInbox({ type: 'comment' }), true);
  assert.equal(shouldStoreInInbox({ type: 'system' }), true);
});
