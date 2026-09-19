const test = require('node:test');
const assert = require('node:assert/strict');
const { requireMapRouteInput } = require('./getMapRoute');

test('map route validates authenticated origin, destination and mode', () => {
  assert.deepEqual(requireMapRouteInput({
    auth: { uid: 'student-a' },
    data: {
      origin: { latitude: 9.93, longitude: 106.34 },
      destination: { latitude: 9.95, longitude: 106.36 },
      mode: 'cycling',
    },
  }), {
    uid: 'student-a',
    origin: { latitude: 9.93, longitude: 106.34 },
    destination: { latitude: 9.95, longitude: 106.36 },
    mode: 'cycling',
  });

  assert.throws(() => requireMapRouteInput({
    auth: { uid: 'student-a' },
    data: { origin: {}, destination: {}, mode: 'flying' },
  }));
});
