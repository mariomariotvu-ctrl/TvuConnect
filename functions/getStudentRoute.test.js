const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRouteResponse,
  projectedCoordinate,
  requireRouteInput,
} = require('./getStudentRoute');

test('route input is authenticated and accepts supported travel modes', () => {
  assert.deepEqual(requireRouteInput({
    auth: { uid: 'student-a' },
    data: { targetUid: 'student-b', mode: 'walking' },
  }), { uid: 'student-a', targetUid: 'student-b', mode: 'walking', origin: null });

  assert.deepEqual(requireRouteInput({
    auth: { uid: 'student-a' },
    data: {
      targetUid: 'student-b',
      mode: 'cycling',
      origin: { latitude: 9.93, longitude: 106.34, accuracy: 12 },
    },
  }).origin, { latitude: 9.93, longitude: 106.34, accuracy: 12 });

  assert.throws(() => requireRouteInput({
    auth: { uid: 'student-a' },
    data: { targetUid: 'student-b', mode: 'flying' },
  }));
});

test('routing provider receives friend-level projected coordinates', () => {
  assert.equal(projectedCoordinate(9.9419123), 9.9419);
  assert.equal(projectedCoordinate(106.3385944), 106.3386);
});

test('route provider response is reduced to safe client fields', () => {
  const route = normalizeRouteResponse({
    routes: [{
      distance: 1240.4,
      duration: 840.2,
      geometry: { coordinates: [[106.3, 9.9], [106.4, 10]] },
      legs: [{ steps: [{
        name: 'Đường Điện Biên Phủ',
        distance: 120,
        duration: 80,
        maneuver: { type: 'turn', modifier: 'right' },
        intersections: [{ unsafe: 'not returned' }],
      }] }],
    }],
  });

  assert.equal(route.distanceMeters, 1240);
  assert.equal(route.path.length, 2);
  assert.deepEqual(route.steps[0], {
    type: 'turn',
    modifier: 'right',
    roadName: 'Đường Điện Biên Phủ',
    distanceMeters: 120,
    durationSeconds: 80,
  });
});
