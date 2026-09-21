const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMatchRequest } = require('./matchVoicePartner');

test('normalizes supported quick matching channels and purposes', () => {
  assert.deepEqual(normalizeMatchRequest({ purpose: 'study', channel: 'text' }), {
    purpose: 'study',
    channel: 'text',
  });
  assert.deepEqual(normalizeMatchRequest({ purpose: 'casual', channel: 'voice' }), {
    purpose: 'casual',
    channel: 'voice',
  });
});

test('falls back to casual voice matching for malformed input', () => {
  assert.deepEqual(normalizeMatchRequest({ purpose: 'dating', channel: 'video' }), {
    purpose: 'casual',
    channel: 'voice',
  });
});
