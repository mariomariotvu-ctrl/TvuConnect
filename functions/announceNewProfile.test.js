const test = require('node:test');
const assert = require('node:assert/strict');
const {
  candidateReason,
  nearbyCellIds,
  normalizeInterest,
  notificationCopy,
  sharedInterests,
  shouldAnnounceProfile,
  communityNotification,
  publishCommunityNotification,
} = require('./announceNewProfile');
const { Timestamp } = require('firebase-admin/firestore');

test('new members do not need interests or location to appear in the community inbox', () => {
  const now = Date.now();
  const profile = { fullName: 'Lan', createdAt: Timestamp.fromMillis(now) };
  assert.equal(shouldAnnounceProfile(undefined, profile, now), true);
  assert.equal(shouldAnnounceProfile({ photoURL: 'https://example.com/a.png' }, profile, now), true);
  assert.equal(shouldAnnounceProfile(profile, { ...profile, fullName: 'Tên mới' }, now), false);
  assert.equal(shouldAnnounceProfile(undefined, profile, now + 7 * 60 * 60 * 1000), false);
  assert.equal(shouldAnnounceProfile(undefined, { ...profile, fullName: 123 }, now), false);
  assert.equal(shouldAnnounceProfile(undefined, { createdAt: profile.createdAt }, now), false);
});

test('shared member event includes only public identity and expires after seven days', () => {
  const joined = Timestamp.now();
  const notice = communityNotification('new-member', {
    fullName: 'Lan', createdAt: joined, phone: 'private', email: 'private',
    nearbyLatitude: 9.5, photoURL: 'javascript:alert(1)',
  });
  assert.equal(notice.route, '/friends?tab=new');
  assert.equal(notice.actorPhotoURL, null);
  assert.equal(notice.phone, undefined);
  assert.equal(notice.email, undefined);
  assert.equal(notice.nearbyLatitude, undefined);
  assert.equal(notice.expiresAt.toMillis() - joined.toMillis(), 7 * 24 * 3600 * 1000);
});

test('duplicate events and deleted accounts do not generate another community item', async () => {
  let exists = false;
  let profileExists = true;
  let creates = 0;
  const firestore = {
    collection: name => ({ doc: id => `${name}/${id}` }),
    runTransaction: callback => callback({
      get: async path => ({ exists: path.startsWith('profiles/') ? profileExists : exists }),
      create: () => { creates++; exists = true; },
    }),
  };
  const profile = { fullName: 'Lan', createdAt: Timestamp.now() };
  assert.equal(await publishCommunityNotification(firestore, 'new-member', profile), true);
  assert.equal(await publishCommunityNotification(firestore, 'new-member', profile), false);
  profileExists = false;
  exists = false;
  assert.equal(await publishCommunityNotification(firestore, 'deleted-member', profile), false);
  assert.equal(creates, 1);
});

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
