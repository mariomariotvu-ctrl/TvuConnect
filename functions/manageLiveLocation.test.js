const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canDiscoverLocation,
  decimalsForVisibility,
  requireLocationUpdate,
  roundEncounterDistance,
  roundCoordinate,
  visibilityForViewer,
} = require('./manageLiveLocation');

test('location precision decreases as the audience gets wider', () => {
  assert.equal(decimalsForVisibility('friends'), 4);
  assert.equal(decimalsForVisibility('major'), 3);
  assert.equal(decimalsForVisibility('tvu'), 2);
  assert.equal(roundCoordinate(9.9419123, 'friends'), 9.9419);
  assert.equal(roundCoordinate(9.9419123, 'major'), 9.942);
  assert.equal(roundCoordinate(9.9419123, 'tvu'), 9.94);
});

test('friends receive a tighter projection than same-major or general TVU viewers', () => {
  const location = { visibility: 'major', majorNormalized: 'cntt' };
  assert.equal(visibilityForViewer(location, 'kinh-te', true), 'friends');
  assert.equal(visibilityForViewer(location, 'cntt', false), 'major');
  assert.equal(visibilityForViewer({ visibility: 'tvu' }, 'cntt', false), 'tvu');
});

test('audience rules require friendship or matching major where configured', () => {
  assert.equal(canDiscoverLocation({ visibility: 'friends' }, 'cntt', false), false);
  assert.equal(canDiscoverLocation({ visibility: 'friends' }, 'cntt', true), true);
  assert.equal(canDiscoverLocation({ visibility: 'major', majorNormalized: 'cntt' }, 'cntt', false), true);
  assert.equal(canDiscoverLocation({ visibility: 'major', majorNormalized: 'cntt' }, 'kinh-te', false), false);
  assert.equal(canDiscoverLocation({ visibility: 'tvu' }, '', false), true);
});

test('location update uses auth uid and supports valid coordinates worldwide', () => {
  const input = requireLocationUpdate({
    auth: { uid: 'student-a' },
    data: {
      uid: 'spoofed',
      latitude: 9.9419,
      longitude: 106.33859,
      accuracy: 15,
      visibility: 'friends',
      encounterAlertsEnabled: true,
      speed: 2.4,
      heading: 370,
    },
  });
  assert.equal(input.uid, 'student-a');
  assert.equal(input.speed, 2.4);
  assert.equal(input.heading, 10);

  const worldwideInput = requireLocationUpdate({
    auth: { uid: 'student-a' },
    data: {
      latitude: 21.0285,
      longitude: 105.8542,
      accuracy: 20,
      visibility: 'tvu',
    },
  });
  assert.equal(worldwideInput.latitude, 21.0285);
  assert.equal(worldwideInput.longitude, 105.8542);

  assert.throws(() => requireLocationUpdate({
    auth: { uid: 'student-a' },
    data: { latitude: 91, longitude: 181, visibility: 'friends' },
  }));
});

test('encounter distances are coarse enough for notifications', () => {
  assert.equal(roundEncounterDistance(2), 5);
  assert.equal(roundEncounterDistance(13), 15);
  assert.equal(roundEncounterDistance(34), 35);
});
