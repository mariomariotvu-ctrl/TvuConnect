const test = require('node:test');
const assert = require('node:assert/strict');
const { notificationTarget, previewComment } = require('./sendCommentNotification');

test('comment notifications go to the post owner', () => {
  assert.deepEqual(notificationTarget(
    { userId: 'writer' },
    null,
    { userId: 'post-owner' },
  ), { recipientUid: 'post-owner', type: 'comment' });
});

test('reply notifications go to the parent comment owner', () => {
  assert.deepEqual(notificationTarget(
    { userId: 'writer', parentCommentId: 'parent-1' },
    { userId: 'parent-owner' },
    { userId: 'post-owner' },
  ), { recipientUid: 'parent-owner', type: 'reply' });
});

test('comment previews stay concise', () => {
  assert.equal(previewComment('a'.repeat(130)).length, 120);
});
