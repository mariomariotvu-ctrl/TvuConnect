/**
 * Wrapper script để chạy create-fake-users.js với environment variables
 * Tự động load từ .env.local
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local từ root directory
const envPath = join(__dirname, '..', '.env.local');
config({ path: envPath });

console.log('🔧 Loading environment variables from .env.local...');
console.log('📦 Firebase Project:', process.env.VITE_FIREBASE_PROJECT_ID || 'NOT FOUND');

if (!process.env.VITE_FIREBASE_API_KEY) {
  console.error('❌ Error: VITE_FIREBASE_API_KEY not found in .env.local');
  process.exit(1);
}

console.log('✅ Environment variables loaded successfully!\n');

// Run the actual script
const scriptPath = join(__dirname, 'create-fake-users.js');
const child = spawn('node', [scriptPath], {
  stdio: 'inherit',
  env: { ...process.env }
});

child.on('exit', (code) => {
  process.exit(code);
});
