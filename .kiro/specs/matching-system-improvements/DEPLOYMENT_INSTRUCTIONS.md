# Deployment Instructions for Matching System Improvements

## Overview

Tasks 0-5 have been completed successfully. The following tasks require manual execution by you:

## Task 6.3: Run Migration Script

The migration script adds the `majorNormalized` field to all existing profiles in Firestore.

### Steps:

1. Make sure you have the Firebase environment variables set in your `.env` file:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

2. Run the migration script:
   ```bash
   npx ts-node scripts/add-major-normalized.ts
   ```

3. The script will:
   - Read all profiles from Firestore
   - Add `majorNormalized` field to each profile
   - Process in batches of 500
   - Log progress and completion

4. Verify the migration completed successfully by checking the console output.

## Task 6.4: Deploy Firestore Indexes

The composite indexes enable efficient database-level filtering.

### Steps:

1. Make sure you have Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase (if not already logged in):
   ```bash
   firebase login
   ```

3. Deploy the indexes:
   ```bash
   firebase deploy --only firestore:indexes
   ```

4. Wait for index creation to complete (this may take several minutes).

5. Verify indexes in Firebase Console:
   - Go to https://console.firebase.google.com
   - Select your project
   - Navigate to Firestore Database → Indexes
   - Confirm all 5 indexes are created and in "Enabled" status

## Task 6.6: Measure and Verify Firestore Read Reduction

After deploying the indexes, test the matching system to verify performance improvements.

### Steps:

1. Open the matching analytics dashboard:
   - Navigate to `public/matching-analytics-dashboard.html`
   - Login with admin credentials
   - Monitor real-time events

2. Test matching with filters:
   - Go to the matching page
   - Apply filters (gender, major, academic year)
   - Click "Bắt đầu ghép cặp"
   - Observe the results

3. Check Firestore usage in Firebase Console:
   - Go to Firestore Database → Usage
   - Compare read counts before and after optimization
   - Target: At least 30% reduction in reads

4. Verify query performance:
   - Queries should complete faster with database-level filtering
   - Check browser console for any errors

## Next Steps

After completing these manual tasks, you can continue with:
- Task 7: Checkpoint - Analytics and optimization complete
- Task 8: Implement match feedback collection system
- And subsequent tasks...

## Troubleshooting

### Migration Script Issues

- **Error: Cannot find module**: Make sure you have TypeScript and ts-node installed
  ```bash
  npm install -D typescript ts-node
  ```

- **Firebase connection error**: Verify your environment variables are correct

### Index Deployment Issues

- **Permission denied**: Make sure you're logged in with an account that has Firebase admin access

- **Index already exists**: This is fine - Firebase will skip existing indexes

### Performance Issues

- **No improvement in read count**: Make sure the indexes are fully built (check Firebase Console)
- **Queries still slow**: Verify the queries are using the correct fields (gender, majorNormalized, academicYear)

