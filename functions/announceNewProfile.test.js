const test = require('node:test');
const assert = require('node:assert/strict');
const {
  candidateReason,
  nearbyCellIds,
  normalizeInterest,
  notificationCopy,
  sharedInterests,
} = require('./announceNewProfile');

test('interest matching ignores Vietnamese accents and casing', () => {
  assert.equal(normalizeInterest('  Âm Nhạc '), 'am nhac');
  assert.deepEqual(sharedInterests(['Âm nhạc', 'Bóng đá'], ['âm NHẠC']), ['Âm nhạc']);
});

test('nearby reason requires both profiles to opt in to the same coarse cell', () => {
  assert.deepEqual(candidateReason(
    { nearbyOptIn: true, nearbyCell: 'w3gabc', interests: ['Sách'] },
    { nearbyOptIn: true, nearbyCell: 'w3gabc', interests: ['sách'] },
  ), { nearby: true, interests: ['Sách'] });

  assert.equal(candidateReason(
    { nearbyOptIn: true, nearbyCell: 'w3gabc' },
    { nearbyOptIn: false, nearbyCell: 'w3gabc' },
  ).nearby, false);

  assert.equal(candidateReason(
    { nearbyOptIn: true, nearbyCell: '497:5316' },
    { nearbyOptIn: true, nearbyCell: '498:5317' },
  ).nearby, true);
  assert.equal(nearbyCellIds('497:5316').length, 9);
});

test('notification copy never exposes a coordinate or exact distance', () => {
  const body = notificationCopy('Lan', { nearby: true, interests: ['Đọc sách'] });
  assert.match(body, /gần khu vực bạn chia sẻ/);
  assert.doesNotMatch(body, /\d+\s*(m|km)|tọa độ/i);
});
