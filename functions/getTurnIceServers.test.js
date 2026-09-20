const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeIceServers } = require('./getTurnIceServers');

test('normalizes Cloudflare relay servers and drops browser-blocked port 53', () => {
  const result = normalizeIceServers({
    iceServers: [
      { urls: ['stun:stun.cloudflare.com:3478'] },
      {
        urls: [
          'turn:turn.cloudflare.com:53?transport=udp',
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turns:turn.cloudflare.com:443?transport=tcp',
        ],
        username: 'short-lived-user',
        credential: 'short-lived-credential',
      },
    ],
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result[1].urls, [
    'turn:turn.cloudflare.com:3478?transport=udp',
    'turns:turn.cloudflare.com:443?transport=tcp',
  ]);
  assert.equal(result[1].username, 'short-lived-user');
});

test('rejects relay entries without credentials and unrelated URLs', () => {
  const result = normalizeIceServers({
    iceServers: [
      { urls: ['https://example.com/ice'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp'] },
    ],
  });

  assert.deepEqual(result, []);
});
