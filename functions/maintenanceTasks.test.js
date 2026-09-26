const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isAllowedDocumentPath,
  shouldDeleteExpiredDocument,
} = require('./maintenanceTasks');

const documentSnapshot = ({ exists = true, expiresAt } = {}) => ({
  exists,
  data: () => ({ expiresAt }),
});

test('cleanup only accepts allowlisted Firestore document paths', () => {
  assert.equal(isAllowedDocumentPath('calls/call-1'), true);
  assert.equal(isAllowedDocumentPath('calls/call-1/callerCandidates/candidate-1'), true);
  assert.equal(isAllowedDocumentPath('profiles/user-1'), false);
  assert.equal(isAllowedDocumentPath('calls'), false);
});

test('cleanup rechecks expiresAt immediately before deleting', () => {
  const now = 1_000;
  assert.equal(shouldDeleteExpiredDocument(documentSnapshot({
    expiresAt: { toMillis: () => now - 1 },
  }), now), true);
  assert.equal(shouldDeleteExpiredDocument(documentSnapshot({
    expiresAt: { toMillis: () => now + 1 },
  }), now), false);
});

test('cleanup skips missing documents and malformed expiration values', () => {
  assert.equal(shouldDeleteExpiredDocument(documentSnapshot({ exists: false }), 1_000), false);
  assert.equal(shouldDeleteExpiredDocument(documentSnapshot({ expiresAt: null }), 1_000), false);
  assert.equal(shouldDeleteExpiredDocument(documentSnapshot({
    expiresAt: { toMillis: () => Number.NaN },
  }), 1_000), false);
});
