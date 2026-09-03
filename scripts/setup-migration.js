/**
 * Interactive Firebase Migration Setup CLI
 * 
 * Script này hỗ trợ thiết lập migration tự động qua terminal.
 * Chạy: node scripts/setup-migration.js
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(colors.cyan + prompt + colors.reset, resolve);
  });
}

// ============================================================================
// STEP 1: Check Firebase CLI
// ============================================================================

async function checkFirebaseCLI() {
  log('\n📦 Kiểm tra Firebase CLI...', 'bright');
  
  try {
    execSync('firebase --version', { stdio: 'ignore' });
    log('✅ Firebase CLI đã được cài đặt', 'green');
    return true;
  } catch {
    log('❌ Firebase CLI chưa được cài đặt', 'red');
    const install = await question('\n💡 Cài đặt Firebase CLI ngay bây giờ? (y/n): ');
    
    if (install.toLowerCase() === 'y') {
      log('\n⏳ Đang cài đặt Firebase CLI...', 'yellow');
      try {
        execSync('npm install -g firebase-tools', { stdio: 'inherit' });
        log('✅ Cài đặt thành công!', 'green');
        return true;
      } catch (error) {
        log('❌ Lỗi khi cài đặt. Vui lòng chạy thủ công: npm install -g firebase-tools', 'red');
        return false;
      }
    }
    return false;
  }
}

// ============================================================================
// STEP 2: Firebase Login
// ============================================================================

async function loginFirebase() {
  log('\n🔐 Đăng nhập Firebase...', 'bright');
  
  try {
    execSync('firebase login:list', { stdio: 'ignore' });
    log('✅ Đã đăng nhập Firebase', 'green');
    return true;
  } catch {
    log('⚠️  Chưa đăng nhập Firebase', 'yellow');
    const login = await question('\n💡 Đăng nhập ngay bây giờ? (y/n): ');
    
    if (login.toLowerCase() === 'y') {
      try {
        execSync('firebase login', { stdio: 'inherit' });
        log('✅ Đăng nhập thành công!', 'green');
        return true;
      } catch (error) {
        log('❌ Lỗi khi đăng nhập', 'red');
        return false;
      }
    }
    return false;
  }
}

// ============================================================================
// STEP 3: List Firebase Projects
// ============================================================================

async function listProjects() {
  log('\n📋 Lấy danh sách Firebase projects...', 'bright');
  
  try {
    const output = execSync('firebase projects:list', { encoding: 'utf8' });
    log(output);
    return true;
  } catch (error) {
    log('❌ Không thể lấy danh sách projects', 'red');
    return false;
  }
}

// ============================================================================
// STEP 4: Download Service Account Keys
// ============================================================================

async function downloadServiceAccounts() {
  log('\n🔑 Thiết lập Service Account Keys', 'bright');
  log('─'.repeat(60));
  
  log('\n📌 Để lấy Service Account Key:', 'yellow');
  log('   1. Mở Firebase Console → Project Settings (⚙️)', 'yellow');
  log('   2. Service accounts → Generate new private key', 'yellow');
  log('   3. Download file JSON\n', 'yellow');
  
  const sourceProjectId = await question('📥 Nhập Project ID CŨ (source): ');
  const targetProjectId = await question('📥 Nhập Project ID MỚI (target): ');
  
  log('\n⚠️  Bạn cần download 2 file Service Account:', 'yellow');
  log(`   • ${sourceProjectId} → source-service-account.json`, 'yellow');
  log(`   • ${targetProjectId} → target-service-account.json`, 'yellow');
  
  const openConsole = await question('\n💡 Mở Firebase Console để download? (y/n): ');
  
  if (openConsole.toLowerCase() === 'y') {
    log('\n🌐 Mở trình duyệt...', 'cyan');
    
    const sourceUrl = `https://console.firebase.google.com/project/${sourceProjectId}/settings/serviceaccounts/adminsdk`;
    const targetUrl = `https://console.firebase.google.com/project/${targetProjectId}/settings/serviceaccounts/adminsdk`;
    
    try {
      // Windows
      if (process.platform === 'win32') {
        execSync(`start ${sourceUrl}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        execSync(`start ${targetUrl}`);
      }
      // macOS
      else if (process.platform === 'darwin') {
        execSync(`open ${sourceUrl}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        execSync(`open ${targetUrl}`);
      }
      // Linux
      else {
        execSync(`xdg-open ${sourceUrl}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        execSync(`xdg-open ${targetUrl}`);
      }
      
      log('✅ Đã mở 2 tab Firebase Console', 'green');
    } catch {
      log(`\n📌 Vui lòng mở thủ công:`, 'yellow');
      log(`   Source: ${sourceUrl}`, 'cyan');
      log(`   Target: ${targetUrl}`, 'cyan');
    }
  }
  
  log('\n⏳ Đợi bạn download 2 file và đổi tên...', 'yellow');
  log('   • source-service-account.json', 'cyan');
  log('   • target-service-account.json', 'cyan');
  log('   Đặt 2 file vào thư mục: scripts/', 'cyan');
  
  await question('\n✅ Nhấn Enter khi đã xong...');
  
  // Check files
  const sourcePath = path.join(__dirname, 'source-service-account.json');
  const targetPath = path.join(__dirname, 'target-service-account.json');
  
  if (fs.existsSync(sourcePath) && fs.existsSync(targetPath)) {
    log('✅ Đã tìm thấy cả 2 file!', 'green');
    return { sourceProjectId, targetProjectId };
  } else {
    if (!fs.existsSync(sourcePath)) log('❌ Không tìm thấy: source-service-account.json', 'red');
    if (!fs.existsSync(targetPath)) log('❌ Không tìm thấy: target-service-account.json', 'red');
    return null;
  }
}

// ============================================================================
// STEP 5: Install Dependencies
// ============================================================================

async function installDependencies() {
  log('\n📦 Kiểm tra dependencies...', 'bright');
  
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  const hasFirebaseAdmin = 
    (packageJson.dependencies && packageJson.dependencies['firebase-admin']) ||
    (packageJson.devDependencies && packageJson.devDependencies['firebase-admin']);
  
  if (hasFirebaseAdmin) {
    log('✅ firebase-admin đã được cài đặt', 'green');
    return true;
  }
  
  log('⚠️  firebase-admin chưa được cài đặt', 'yellow');
  const install = await question('\n💡 Cài đặt ngay bây giờ? (y/n): ');
  
  if (install.toLowerCase() === 'y') {
    log('\n⏳ Đang cài đặt firebase-admin...', 'yellow');
    try {
      execSync('npm install firebase-admin --save-dev', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
      log('✅ Cài đặt thành công!', 'green');
      return true;
    } catch (error) {
      log('❌ Lỗi khi cài đặt', 'red');
      return false;
    }
  }
  return false;
}

// ============================================================================
// STEP 6: Run Migration
// ============================================================================

async function runMigration() {
  log('\n🚀 Chạy Migration', 'bright');
  log('─'.repeat(60));
  
  log('\n⚠️  LƯU Ý QUAN TRỌNG:', 'red');
  log('   • Migration có thể mất vài phút đến vài giờ tuỳ lượng dữ liệu', 'yellow');
  log('   • KHÔNG tắt terminal trong khi chạy', 'yellow');
  log('   • Nên backup dữ liệu trước khi chạy', 'yellow');
  
  const confirm = await question('\n✅ Xác nhận chạy migration? (yes/no): ');
  
  if (confirm.toLowerCase() === 'yes') {
    log('\n⏳ Đang chạy migration script...', 'cyan');
    log('─'.repeat(60) + '\n');
    
    try {
      execSync('node scripts/migrate-firebase.js', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      return true;
    } catch (error) {
      log('\n❌ Migration thất bại', 'red');
      return false;
    }
  } else {
    log('\n⚠️  Migration đã bị hủy', 'yellow');
    return false;
  }
}

// ============================================================================
// STEP 7: Update Environment
// ============================================================================

async function updateEnvironment(targetProjectId) {
  log('\n⚙️  Cập nhật Environment Variables', 'bright');
  log('─'.repeat(60));
  
  const update = await question('\n💡 Cập nhật .env file với Firebase config mới? (y/n): ');
  
  if (update.toLowerCase() === 'y') {
    log('\n📌 Lấy Firebase config:', 'yellow');
    log('   1. Firebase Console → Project Settings', 'yellow');
    log('   2. General → Your apps → Web app', 'yellow');
    log('   3. Copy config object\n', 'yellow');
    
    const openConsole = await question('💡 Mở Firebase Console? (y/n): ');
    
    if (openConsole.toLowerCase() === 'y') {
      const url = `https://console.firebase.google.com/project/${targetProjectId}/settings/general`;
      try {
        if (process.platform === 'win32') execSync(`start ${url}`);
        else if (process.platform === 'darwin') execSync(`open ${url}`);
        else execSync(`xdg-open ${url}`);
        log('✅ Đã mở Firebase Console', 'green');
      } catch {
        log(`\n📌 Vui lòng mở: ${url}`, 'cyan');
      }
    }
    
    log('\n📝 Nhập Firebase config mới:', 'cyan');
    const apiKey = await question('   VITE_FIREBASE_API_KEY: ');
    const authDomain = await question('   VITE_FIREBASE_AUTH_DOMAIN: ');
    const storageBucket = await question('   VITE_FIREBASE_STORAGE_BUCKET: ');
    const messagingSenderId = await question('   VITE_FIREBASE_MESSAGING_SENDER_ID: ');
    const appId = await question('   VITE_FIREBASE_APP_ID: ');
    
    const envContent = `# Firebase Configuration - Project: ${targetProjectId}
VITE_FIREBASE_API_KEY=${apiKey}
VITE_FIREBASE_AUTH_DOMAIN=${authDomain}
VITE_FIREBASE_PROJECT_ID=${targetProjectId}
VITE_FIREBASE_STORAGE_BUCKET=${storageBucket}
VITE_FIREBASE_MESSAGING_SENDER_ID=${messagingSenderId}
VITE_FIREBASE_APP_ID=${appId}

# Gemini AI
VITE_GEMINI_API_KEY=your_gemini_api_key
`;
    
    const envPath = path.join(__dirname, '..', '.env.local');
    fs.writeFileSync(envPath, envContent);
    log('\n✅ Đã cập nhật .env.local', 'green');
  }
}

// ============================================================================
// STEP 8: Cleanup
// ============================================================================

async function cleanup() {
  log('\n🧹 Dọn dẹp', 'bright');
  log('─'.repeat(60));
  
  const remove = await question('\n💡 Xóa Service Account files? (KHUYẾN NGHỊ) (y/n): ');
  
  if (remove.toLowerCase() === 'y') {
    try {
      const sourcePath = path.join(__dirname, 'source-service-account.json');
      const targetPath = path.join(__dirname, 'target-service-account.json');
      
      if (fs.existsSync(sourcePath)) {
        fs.unlinkSync(sourcePath);
        log('✅ Đã xóa source-service-account.json', 'green');
      }
      
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        log('✅ Đã xóa target-service-account.json', 'green');
      }
      
      log('\n⚠️  QUAN TRỌNG: 2 file này chứa credentials nhạy cảm!', 'yellow');
      log('   Đảm bảo không commit lên Git.', 'yellow');
      
    } catch (error) {
      log('❌ Không thể xóa files', 'red');
    }
  }
}

// ============================================================================
// MAIN FLOW
// ============================================================================

async function main() {
  log('\n' + '═'.repeat(60), 'bright');
  log('🚀 FIREBASE MIGRATION SETUP CLI', 'bright');
  log('═'.repeat(60) + '\n', 'bright');
  
  try {
    // Step 1: Check Firebase CLI
    const hasFirebaseCLI = await checkFirebaseCLI();
    if (!hasFirebaseCLI) {
      log('\n❌ Không thể tiếp tục. Vui lòng cài Firebase CLI trước.', 'red');
      rl.close();
      return;
    }
    
    // Step 2: Login
    const isLoggedIn = await loginFirebase();
    if (!isLoggedIn) {
      log('\n❌ Không thể tiếp tục. Vui lòng đăng nhập Firebase.', 'red');
      rl.close();
      return;
    }
    
    // Step 3: List projects
    await listProjects();
    
    // Step 4: Download service accounts
    const projectIds = await downloadServiceAccounts();
    if (!projectIds) {
      log('\n❌ Không tìm thấy Service Account files. Setup bị hủy.', 'red');
      rl.close();
      return;
    }
    
    // Step 5: Install dependencies
    const hasDeps = await installDependencies();
    if (!hasDeps) {
      log('\n❌ Thiếu dependencies. Vui lòng cài firebase-admin.', 'red');
      rl.close();
      return;
    }
    
    // Step 6: Run migration
    const success = await runMigration();
    
    if (success) {
      // Step 7: Update environment
      await updateEnvironment(projectIds.targetProjectId);
      
      // Step 8: Cleanup
      await cleanup();
      
      log('\n' + '═'.repeat(60), 'green');
      log('✅ MIGRATION HOÀN TẤT!', 'green');
      log('═'.repeat(60) + '\n', 'green');
      
      log('📋 Các bước tiếp theo:', 'cyan');
      log('   1. Kiểm tra dữ liệu trên Firebase Console', 'cyan');
      log('   2. Test đăng nhập app', 'cyan');
      log('   3. Deploy rules: firebase deploy --only firestore:rules,storage', 'cyan');
      log('   4. Deploy app: npm run build && firebase deploy', 'cyan');
    } else {
      log('\n⚠️  Migration không thành công. Xem log để biết chi tiết.', 'yellow');
    }
    
  } catch (error) {
    log('\n❌ Lỗi: ' + error.message, 'red');
  } finally {
    rl.close();
  }
}

// Run
main().catch(console.error);
