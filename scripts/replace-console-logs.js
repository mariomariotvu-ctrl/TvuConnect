/**
 * Script to replace console.log with logger.log
 * Usage: node scripts/replace-console-logs.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../src');
const excludeDirs = ['test', 'tests', '__tests__'];
const excludeFiles = ['logger.ts', 'logger.test.ts'];

// Files to process
const filesToProcess = [];

function getAllTsFiles(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip excluded directories
      if (!excludeDirs.includes(file)) {
        getAllTsFiles(filePath);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // Skip excluded files
      if (!excludeFiles.includes(file)) {
        filesToProcess.push(filePath);
      }
    }
  });
}

function replaceConsoleLogs(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Check if file has console.log/warn/info/debug
  const hasConsoleLogs = /console\.(log|warn|info|debug)\(/g.test(content);
  
  if (!hasConsoleLogs) {
    return false;
  }
  
  // Check if logger is already imported
  const hasLoggerImport = /import.*logger.*from.*['"].*logger['"]/.test(content);
  
  // Replace console.log with logger.log
  content = content.replace(/console\.log\(/g, 'logger.log(');
  content = content.replace(/console\.warn\(/g, 'logger.warn(');
  content = content.replace(/console\.info\(/g, 'logger.info(');
  content = content.replace(/console\.debug\(/g, 'logger.debug(');
  
  // Add logger import if not present
  if (!hasLoggerImport) {
    // Find the last import statement
    const importRegex = /^import .* from ['"].*['"];?$/gm;
    const imports = content.match(importRegex);
    
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      const insertPosition = lastImportIndex + lastImport.length;
      
      // Insert logger import after last import
      content = content.slice(0, insertPosition) + 
                "\nimport { logger } from '@/utils/logger';" +
                content.slice(insertPosition);
      modified = true;
    }
  }
  
  if (modified || hasConsoleLogs) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  
  return false;
}

// Main execution
console.log('🔍 Scanning for files with console.log...\n');
getAllTsFiles(srcDir);

console.log(`📁 Found ${filesToProcess.length} TypeScript files\n`);

let modifiedCount = 0;
const modifiedFiles = [];

filesToProcess.forEach(filePath => {
  if (replaceConsoleLogs(filePath)) {
    modifiedCount++;
    const relativePath = path.relative(process.cwd(), filePath);
    modifiedFiles.push(relativePath);
    console.log(`✅ Modified: ${relativePath}`);
  }
});

console.log(`\n✨ Summary:`);
console.log(`   Total files scanned: ${filesToProcess.length}`);
console.log(`   Files modified: ${modifiedCount}`);

if (modifiedFiles.length > 0) {
  console.log(`\n📝 Modified files:`);
  modifiedFiles.forEach(file => console.log(`   - ${file}`));
}

console.log(`\n✅ Done! Console logs replaced with logger.`);
console.log(`\n💡 Note: console.error() is kept as-is (for production errors)`);
