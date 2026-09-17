const { existsSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const javaCandidates = [
  process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin', 'java'),
  '/opt/homebrew/opt/openjdk@21/bin/java',
  '/usr/local/opt/openjdk@21/bin/java',
  '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
  'java',
].filter(Boolean);

const javaVersion = (executable) => {
  const result = spawnSync(executable, ['-version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return 0;
  const output = `${result.stderr || ''}\n${result.stdout || ''}`;
  const match = output.match(/version\s+"?(\d+)/i);
  return Number(match?.[1] || 0);
};

const java = javaCandidates.find((candidate) => (
  (candidate === 'java' || existsSync(candidate)) && javaVersion(candidate) >= 21
));

if (!java) {
  console.error('Firestore Emulator cần Java 21 trở lên. Hãy cài OpenJDK 21 rồi chạy lại.');
  process.exit(1);
}

const javaBin = dirname(java === 'java' ? process.execPath : java);
const javaHome = java === 'java' ? process.env.JAVA_HOME : dirname(javaBin);
const firebaseBinary = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'firebase.cmd' : 'firebase',
);
const result = spawnSync(
  firebaseBinary,
  ['emulators:exec', '--only', 'firestore', 'vitest run firestore.rules.test.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(javaHome ? { JAVA_HOME: javaHome } : {}),
      PATH: `${javaBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
    },
  },
);

process.exit(result.status ?? 1);
