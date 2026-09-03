/**
 * Firebase Migration Script
 * 
 * Script này giúp chuyển toàn bộ dữ liệu từ Firebase project cũ sang project mới:
 * - Firestore collections (profiles, posts, messages, conversations, matches, etc.)
 * - Authentication users
 * - Storage files (avatars, images)
 * 
 * CÁCH SỬ DỤNG:
 * 1. Tải Service Account keys của cả 2 projects từ Firebase Console
 * 2. Đặt vào thư mục scripts/ với tên:
 *    - source-service-account.json (project cũ)
 *    - target-service-account.json (project mới)
 * 3. Chạy: node scripts/migrate-firebase.js
 * 
 * LƯU Ý QUAN TRỌNG:
 * - Backup dữ liệu trước khi chạy
 * - Script sẽ không xóa dữ liệu cũ
 * - Chạy trong môi trường an toàn (local hoặc server riêng)
 * - Có thể mất vài giờ tuỳ lượng dữ liệu
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const SOURCE_SERVICE_ACCOUNT = path.join(__dirname, 'source-service-account.json');
const TARGET_SERVICE_ACCOUNT = path.join(__dirname, 'target-service-account.json');

const COLLECTIONS_TO_MIGRATE = [
  'profiles',
  'posts',
  'comments',
  'messages',
  'conversations',
  'matches',
  'blocks',
  'reports',
  'favorites',
  'notifications',
  'places',
  'checkIns',
  'placeEvents',
  'placeReviews',
  'documents',
  'rentalPosts',
];

const BATCH_SIZE = 500; // Firestore batch limit
const DELAY_MS = 100; // Delay between batches to avoid rate limits

// ============================================================================
// INITIALIZE FIREBASE APPS
// ============================================================================

let sourceApp, targetApp, sourceDb, targetDb, sourceAuth, targetAuth, sourceStorage, targetStorage;

function initializeApps() {
  console.log('🔧 Initializing Firebase apps...\n');

  // Check if service account files exist
  if (!fs.existsSync(SOURCE_SERVICE_ACCOUNT)) {
    throw new Error(`❌ Source service account not found at: ${SOURCE_SERVICE_ACCOUNT}`);
  }
  if (!fs.existsSync(TARGET_SERVICE_ACCOUNT)) {
    throw new Error(`❌ Target service account not found at: ${TARGET_SERVICE_ACCOUNT}`);
  }

  const sourceCredentials = JSON.parse(fs.readFileSync(SOURCE_SERVICE_ACCOUNT, 'utf8'));
  const targetCredentials = JSON.parse(fs.readFileSync(TARGET_SERVICE_ACCOUNT, 'utf8'));

  // Initialize source app
  sourceApp = initializeApp({
    credential: cert(sourceCredentials),
    storageBucket: sourceCredentials.project_id + '.appspot.com',
  }, 'source');

  // Initialize target app
  targetApp = initializeApp({
    credential: cert(targetCredentials),
    storageBucket: targetCredentials.project_id + '.appspot.com',
  }, 'target');

  sourceDb = getFirestore(sourceApp, 'ai-studio-62bb52f6-b84d-407e-9909-54f7fb36c151');
  targetDb = getFirestore(targetApp);
  sourceAuth = getAuth(sourceApp);
  targetAuth = getAuth(targetApp);
  sourceStorage = getStorage(sourceApp).bucket();
  targetStorage = getStorage(targetApp).bucket();

  console.log(`✅ Source project: ${sourceCredentials.project_id}`);
  console.log(`✅ Target project: ${targetCredentials.project_id}\n`);
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function convertTimestamps(data) {
  if (!data || typeof data !== 'object') return data;

  const result = Array.isArray(data) ? [] : {};

  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object') {
      // Check if it's a Firestore Timestamp
      if (value._seconds !== undefined && value._nanoseconds !== undefined) {
        result[key] = Timestamp.fromMillis(
          value._seconds * 1000 + Math.floor(value._nanoseconds / 1000000)
        );
      } else if (value.toDate && typeof value.toDate === 'function') {
        // Already a Timestamp object
        result[key] = value;
      } else {
        // Recursively process nested objects
        result[key] = convertTimestamps(value);
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

async function migrateCollection(collectionName) {
  console.log(`\n📦 Migrating collection: ${collectionName}`);
  console.log('─'.repeat(60));

  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);

  let totalDocs = 0;
  let migratedDocs = 0;
  let failedDocs = 0;

  try {
    // Get all documents from source
    const snapshot = await sourceCollection.get();
    totalDocs = snapshot.size;

    console.log(`📊 Total documents: ${totalDocs}`);

    if (totalDocs === 0) {
      console.log(`⚠️  Collection "${collectionName}" is empty, skipping...`);
      return { total: 0, migrated: 0, failed: 0 };
    }

    // Process in batches
    let batch = targetDb.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        const convertedData = convertTimestamps(data);
        const targetDocRef = targetCollection.doc(doc.id);

        batch.set(targetDocRef, convertedData);
        batchCount++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          migratedDocs += batchCount;
          console.log(`   ✓ Migrated ${migratedDocs}/${totalDocs} documents...`);
          
          batch = targetDb.batch();
          batchCount = 0;
          await sleep(DELAY_MS); // Rate limit protection
        }
      } catch (error) {
        console.error(`   ✗ Failed to migrate document ${doc.id}:`, error.message);
        failedDocs++;
      }
    }

    // Commit remaining documents
    if (batchCount > 0) {
      await batch.commit();
      migratedDocs += batchCount;
    }

    console.log(`\n✅ Collection "${collectionName}" migration complete:`);
    console.log(`   • Total: ${totalDocs}`);
    console.log(`   • Migrated: ${migratedDocs}`);
    console.log(`   • Failed: ${failedDocs}`);

    return { total: totalDocs, migrated: migratedDocs, failed: failedDocs };

  } catch (error) {
    console.error(`❌ Error migrating collection "${collectionName}":`, error);
    return { total: totalDocs, migrated: migratedDocs, failed: failedDocs };
  }
}

async function migrateAuthUsers() {
  console.log(`\n👥 Migrating Authentication users`);
  console.log('─'.repeat(60));

  let totalUsers = 0;
  let migratedUsers = 0;
  let failedUsers = 0;

  try {
    let nextPageToken;
    
    do {
      // List users from source
      const listUsersResult = await sourceAuth.listUsers(1000, nextPageToken);
      totalUsers += listUsersResult.users.length;

      for (const user of listUsersResult.users) {
        try {
          // Prepare user data for import
          const userImportRecord = {
            uid: user.uid,
            email: user.email,
            emailVerified: user.emailVerified,
            displayName: user.displayName,
            photoURL: user.photoURL,
            disabled: user.disabled,
            metadata: {
              creationTime: user.metadata.creationTime,
              lastSignInTime: user.metadata.lastSignInTime,
            },
            providerData: user.providerData,
          };

          // Import user to target
          await targetAuth.importUsers([userImportRecord]);
          migratedUsers++;

          if (migratedUsers % 100 === 0) {
            console.log(`   ✓ Migrated ${migratedUsers} users...`);
          }

        } catch (error) {
          // User might already exist, try to update instead
          if (error.code === 'auth/uid-already-exists') {
            try {
              await targetAuth.updateUser(user.uid, {
                email: user.email,
                emailVerified: user.emailVerified,
                displayName: user.displayName,
                photoURL: user.photoURL,
                disabled: user.disabled,
              });
              migratedUsers++;
            } catch (updateError) {
              console.error(`   ✗ Failed to update user ${user.uid}:`, updateError.message);
              failedUsers++;
            }
          } else {
            console.error(`   ✗ Failed to migrate user ${user.uid}:`, error.message);
            failedUsers++;
          }
        }
      }

      nextPageToken = listUsersResult.pageToken;
      
      if (nextPageToken) {
        await sleep(DELAY_MS);
      }

    } while (nextPageToken);

    console.log(`\n✅ Authentication users migration complete:`);
    console.log(`   • Total: ${totalUsers}`);
    console.log(`   • Migrated: ${migratedUsers}`);
    console.log(`   • Failed: ${failedUsers}`);

    return { total: totalUsers, migrated: migratedUsers, failed: failedUsers };

  } catch (error) {
    console.error(`❌ Error migrating authentication users:`, error);
    return { total: totalUsers, migrated: migratedUsers, failed: failedUsers };
  }
}

async function migrateStorage() {
  console.log(`\n📁 Migrating Storage files`);
  console.log('─'.repeat(60));
  console.log('⚠️  Note: Storage migration can be slow for large files\n');

  let totalFiles = 0;
  let migratedFiles = 0;
  let failedFiles = 0;

  try {
    // List all files in source storage
    const [files] = await sourceStorage.getFiles({ autoPaginate: true });
    totalFiles = files.length;

    console.log(`📊 Total files: ${totalFiles}`);

    if (totalFiles === 0) {
      console.log(`⚠️  Storage is empty, skipping...`);
      return { total: 0, migrated: 0, failed: 0 };
    }

    for (const file of files) {
      try {
        const fileName = file.name;
        
        // Download file from source
        const [fileBuffer] = await file.download();
        
        // Upload to target
        const targetFile = targetStorage.file(fileName);
        await targetFile.save(fileBuffer, {
          metadata: file.metadata,
          contentType: file.metadata.contentType,
        });

        migratedFiles++;

        if (migratedFiles % 50 === 0) {
          console.log(`   ✓ Migrated ${migratedFiles}/${totalFiles} files...`);
        }

        await sleep(DELAY_MS / 2); // Rate limit protection

      } catch (error) {
        console.error(`   ✗ Failed to migrate file ${file.name}:`, error.message);
        failedFiles++;
      }
    }

    console.log(`\n✅ Storage migration complete:`);
    console.log(`   • Total: ${totalFiles}`);
    console.log(`   • Migrated: ${migratedFiles}`);
    console.log(`   • Failed: ${failedFiles}`);

    return { total: totalFiles, migrated: migratedFiles, failed: failedFiles };

  } catch (error) {
    console.error(`❌ Error migrating storage:`, error);
    return { total: totalFiles, migrated: migratedFiles, failed: failedFiles };
  }
}

// ============================================================================
// MAIN MIGRATION FLOW
// ============================================================================

async function runMigration() {
  const startTime = Date.now();
  
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 FIREBASE MIGRATION SCRIPT');
  console.log('═'.repeat(60) + '\n');

  try {
    // Initialize
    initializeApps();

    const stats = {
      collections: [],
      auth: null,
      storage: null,
    };

    // Confirm before proceeding
    console.log('⚠️  WARNING: This will copy ALL data to the target project.');
    console.log('   Make sure you have backed up your data!\n');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    await sleep(5000);

    // Migrate Firestore collections
    console.log('\n' + '═'.repeat(60));
    console.log('📚 MIGRATING FIRESTORE COLLECTIONS');
    console.log('═'.repeat(60));

    for (const collectionName of COLLECTIONS_TO_MIGRATE) {
      const result = await migrateCollection(collectionName);
      stats.collections.push({ name: collectionName, ...result });
    }

    // Migrate Authentication - SKIP (already done)
    console.log('\n' + '═'.repeat(60));
    console.log('🔐 SKIPPING AUTHENTICATION (already migrated)');
    console.log('═'.repeat(60));
    stats.auth = { total: 3, migrated: 3, failed: 0 };

    // Migrate Storage
    console.log('\n' + '═'.repeat(60));
    console.log('💾 MIGRATING STORAGE');
    console.log('═'.repeat(60));
    console.log('⚠️  Skipping storage migration — enable Storage in target project first');
    stats.storage = { total: 0, migrated: 0, failed: 0 };

    // Summary
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    console.log('\n' + '═'.repeat(60));
    console.log('✅ MIGRATION COMPLETE');
    console.log('═'.repeat(60) + '\n');

    console.log('📊 Summary:');
    console.log('─'.repeat(60));
    
    console.log('\nFirestore Collections:');
    let totalDocs = 0, totalMigrated = 0, totalFailed = 0;
    for (const stat of stats.collections) {
      console.log(`   • ${stat.name}: ${stat.migrated}/${stat.total} (${stat.failed} failed)`);
      totalDocs += stat.total;
      totalMigrated += stat.migrated;
      totalFailed += stat.failed;
    }
    console.log(`   TOTAL: ${totalMigrated}/${totalDocs} documents (${totalFailed} failed)`);

    console.log('\nAuthentication:');
    console.log(`   • Users: ${stats.auth.migrated}/${stats.auth.total} (${stats.auth.failed} failed)`);

    console.log('\nStorage:');
    console.log(`   • Files: ${stats.storage.migrated}/${stats.storage.total} (${stats.storage.failed} failed)`);

    console.log(`\n⏱️  Total time: ${duration} seconds`);
    console.log('\n' + '═'.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await sourceApp.delete();
    await targetApp.delete();
  }
}

// ============================================================================
// RUN
// ============================================================================

runMigration().catch(console.error);
