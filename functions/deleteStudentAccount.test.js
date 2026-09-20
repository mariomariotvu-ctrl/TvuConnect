const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasRecentAuthentication,
  normalizeDeletionReason,
  querySpecsFor,
} = require('./deleteStudentAccount');

test('requires authentication from the last ten minutes', () => {
  assert.equal(hasRecentAuthentication(1_000, 1_599), true);
  assert.equal(hasRecentAuthentication(1_000, 1_601), false);
  assert.equal(hasRecentAuthentication(0, 1_000), false);
});

test('keeps deletion feedback anonymous and bounded', () => {
  assert.equal(normalizeDeletionReason('  Không còn nhu cầu  '), 'Không còn nhu cầu');
  assert.equal(normalizeDeletionReason('x'.repeat(300)).length, 240);
  assert.equal(normalizeDeletionReason({ reason: 'invalid' }), '');
});

test('deletion queries cover both sides of social relationships', () => {
  const specs = querySpecsFor('student-1').map((spec) => spec.slice(0, 2).join(':'));
  assert.ok(specs.includes('blocks:blockerUid'));
  assert.ok(specs.includes('blocks:blockedUid'));
  assert.ok(specs.includes('datingLikes:fromUid'));
  assert.ok(specs.includes('datingLikes:toUid'));
  assert.ok(specs.includes('messages:participants'));
});
