const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeContext, sanitizeTelemetry } = require('./reportClientTelemetry');

test('redacts secrets and private contact data from client telemetry', () => {
  const telemetry = sanitizeTelemetry({
    eventType: 'auth.redirect_failed',
    severity: 'error',
    message: 'Bearer secret-token user@example.com AIza1234567890123456789012345',
    context: {
      token: 'never-store-me',
      email: 'user@example.com',
      provider: 'google',
    },
  });

  assert.equal(telemetry.severity, 'ERROR');
  assert.match(telemetry.message, /\[redacted\]/);
  assert.match(telemetry.message, /\[email\]/);
  assert.match(telemetry.message, /\[google-key\]/);
  assert.deepEqual(telemetry.context, { provider: 'google' });
});

test('keeps only bounded primitive diagnostic context', () => {
  assert.deepEqual(sanitizeContext({
    attempt: 2,
    online: false,
    nested: { code: 'auth/popup-blocked', password: 'hidden' },
    list: ['zalo', 3, true, { ignored: true }],
  }), {
    attempt: 2,
    online: false,
    nested: { code: 'auth/popup-blocked' },
    list: ['zalo', 3, true],
  });
});

test('normalizes invalid event names', () => {
  assert.equal(sanitizeTelemetry({ eventType: 'INVALID EVENT!' }).eventType, 'client.invalid_event');
});
