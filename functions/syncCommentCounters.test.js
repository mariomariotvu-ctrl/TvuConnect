const test = require('node:test');
const assert = require('node:assert/strict');
const { commentCounterTarget, counterDelta } = require('./syncCommentCounters');

test('counter delta only changes for comment creation or deletion', () => {
  assert.equal(counterDelta(false, true), 1);
  assert.equal(counterDelta(true, false), -1);
  assert.equal(counterDelta(true, true), 0);
  assert.equal(counterDelta(false, false), 0);
});

test('top-level comments update the post counter', () => {
  assert.deepEqual(commentCounterTarget({ postId: 'post-1' }), {
    collection: 'posts',
    id: 'post-1',
    field: 'commentCount',
  });
});

test('replies update only their parent comment counter', () => {
  assert.deepEqual(commentCounterTarget({ postId: 'post-1', parentCommentId: 'comment-1' }), {
    collection: 'comments',
    id: 'comment-1',
    field: 'replyCount',
  });
});

test('invalid document ids are ignored', () => {
  assert.equal(commentCounterTarget({ postId: 'posts/other' }), null);
});
