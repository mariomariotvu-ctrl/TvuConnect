const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 22_050;
const OUTPUT_DIRECTORY = path.resolve(__dirname, '../public/sounds');

const soundDefinitions = {
  'message-in.wav': {
    duration: 0.62,
    events: [
      { start: 0, duration: 0.28, frequencies: [784, 1176], volume: 0.32 },
      { start: 0.2, duration: 0.34, frequencies: [988, 1482], volume: 0.27 },
    ],
  },
  'message-out.wav': {
    duration: 0.28,
    events: [
      { start: 0, duration: 0.2, frequencies: [620, 930], volume: 0.24 },
    ],
  },
  'incoming-call.wav': {
    duration: 3.2,
    events: [
      { start: 0, duration: 0.48, frequencies: [659, 988], volume: 0.3 },
      { start: 0.56, duration: 0.48, frequencies: [784, 1176], volume: 0.3 },
      { start: 1.36, duration: 0.48, frequencies: [659, 988], volume: 0.3 },
      { start: 1.92, duration: 0.48, frequencies: [784, 1176], volume: 0.3 },
    ],
  },
  'outgoing-call.wav': {
    duration: 3.4,
    events: [
      { start: 0, duration: 0.75, frequencies: [440, 480], volume: 0.22 },
      { start: 1.6, duration: 0.75, frequencies: [440, 480], volume: 0.22 },
    ],
  },
  'call-connected.wav': {
    duration: 0.4,
    events: [
      { start: 0, duration: 0.17, frequencies: [523, 784], volume: 0.25 },
      { start: 0.14, duration: 0.2, frequencies: [784, 1047], volume: 0.24 },
    ],
  },
  'call-ended.wav': {
    duration: 0.52,
    events: [
      { start: 0, duration: 0.22, frequencies: [659, 494], volume: 0.22 },
      { start: 0.2, duration: 0.25, frequencies: [494, 330], volume: 0.2 },
    ],
  },
  'encounter.wav': {
    duration: 0.78,
    events: [
      { start: 0, duration: 0.22, frequencies: [740, 1110], volume: 0.3 },
      { start: 0.32, duration: 0.28, frequencies: [880, 1320], volume: 0.3 },
    ],
  },
  'friend-request.wav': {
    duration: 0.72,
    events: [
      { start: 0, duration: 0.18, frequencies: [523], volume: 0.25 },
      { start: 0.16, duration: 0.18, frequencies: [659], volume: 0.25 },
      { start: 0.32, duration: 0.3, frequencies: [784, 1047], volume: 0.24 },
    ],
  },
  'match.wav': {
    duration: 1.02,
    events: [
      { start: 0, duration: 0.24, frequencies: [523, 659], volume: 0.25 },
      { start: 0.22, duration: 0.24, frequencies: [659, 784], volume: 0.25 },
      { start: 0.44, duration: 0.46, frequencies: [784, 988, 1176], volume: 0.22 },
    ],
  },
  'study-room.wav': {
    duration: 0.82,
    events: [
      { start: 0, duration: 0.32, frequencies: [587, 880], volume: 0.24 },
      { start: 0.28, duration: 0.44, frequencies: [880, 1175], volume: 0.22 },
    ],
  },
  'success.wav': {
    duration: 0.58,
    events: [
      { start: 0, duration: 0.2, frequencies: [659], volume: 0.22 },
      { start: 0.17, duration: 0.32, frequencies: [988, 1319], volume: 0.21 },
    ],
  },
  'error.wav': {
    duration: 0.58,
    events: [
      { start: 0, duration: 0.2, frequencies: [392, 370], volume: 0.2 },
      { start: 0.24, duration: 0.26, frequencies: [330, 311], volume: 0.2 },
    ],
  },
};

function envelope(elapsed, duration) {
  const attack = Math.min(0.025, duration / 4);
  const release = Math.min(0.14, duration / 2);
  if (elapsed < attack) return elapsed / attack;
  if (elapsed > duration - release) return Math.max(0, (duration - elapsed) / release);
  return 1;
}

function renderSound(definition) {
  const sampleCount = Math.ceil(definition.duration * SAMPLE_RATE);
  const pcm = Buffer.alloc(sampleCount * 2);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const time = sampleIndex / SAMPLE_RATE;
    let value = 0;

    definition.events.forEach((event) => {
      const elapsed = time - event.start;
      if (elapsed < 0 || elapsed > event.duration) return;
      const wave = event.frequencies.reduce((sum, frequency, frequencyIndex) => (
        sum + Math.sin(2 * Math.PI * frequency * elapsed + frequencyIndex * 0.12)
      ), 0) / event.frequencies.length;
      value += wave * event.volume * envelope(elapsed, event.duration);
    });

    const limited = Math.max(-0.92, Math.min(0.92, value));
    pcm.writeInt16LE(Math.round(limited * 32767), sampleIndex * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
Object.entries(soundDefinitions).forEach(([fileName, definition]) => {
  fs.writeFileSync(path.join(OUTPUT_DIRECTORY, fileName), renderSound(definition));
});

console.log(`Generated ${Object.keys(soundDefinitions).length} notification sounds in ${OUTPUT_DIRECTORY}`);
