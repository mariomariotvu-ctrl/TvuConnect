# Firestore Query Optimization - Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Firestore Query Optimization system to production. The deployment includes composite index creation, feature flag configuration, testing procedures, and rollback plans.

**Expected Impact:**
- 50% reduction in Firestore document reads
- 50% reduction in monthly Firestore costs
- 2-3x faster data loading times
- 30%+ cache hit rate
- Improved user experience across all features

---

## Pre-Deployment Checklist

### 1. Verify All Code Changes Are Merged

Ensure all optimization modules are implemented and tested:

- [ ] Cache Manager (`src/utils/firestoreCacheManager.ts`)
- [ ] Query Optimizer (`src/utils/firestoreQueryOptimizer.ts`)
- [ ] Listener Manager (`src/utils/firestoreListenerManager.ts`)
- [ ] Batch Processor (`src/utils/firestoreBatchProcessor.ts`)
- [ ] Query Monitor (`src/utils/firestoreQueryMonitor.ts`)
- [ ] Optimized Hooks:
  - [ ] `usePosts.ts`
  - [ ] `useConversations.ts`
  - [ ] `useMessages.ts`
  - [ ] `useUserProfile.ts`
  - [ ] `useBlockedUsersBatch.ts`
- [ ] MapView component optimizations
- [ ] All unit tests passing

### 2. Backup Current Firestore Data

Before making any changes, create a backup:

```bash
# Export all Firestore data
firebase firestore:export gs://[YOUR-BUCKET]/backups/pre-optimization-$(date +%Y%m%d)
```

### 3. Review Current Metrics

Document baseline metrics for comparison:

- [ ] Current daily document reads (check Firebase Console)
- [ ] Current monthly Firestore costs
- [ ] Average page load times
- [ ] User-reported performance issues

---

## Phase 1: Deploy Composite Indexes

### Step 1: Review Index Configuration

The `firestore.indexes.json` file contains all required composite indexes:

```bash
# View the indexes file
cat firestore.indexes.json
```

**Key Indexes:**
- **Posts**: `(createdAt DESC)` - for feed pagination
- **Messages**: `(conversationId, createdAt DESC)` - for conversation messages
- **Profiles**: `(gender, majorNormalized, academicYear)` - for matching filters
- **CheckIns**: `(expiresAt, createdAt DESC)` - for active check-ins
- **Events**: `(startTime, createdAt DESC)` - for upcoming events
- **Favorites**: `(fromUid, toUid)` - for favorites lookup
- **Blocks**: `(blockerUid, blockedUid)` - for blocked users lookup

### Step 2: Deploy Indexes to Firebase

```bash
# Deploy indexes using Firebase CLI
firebase deploy --only firestore:indexes

# Expected output:
# ✔ Deploy complete!
# Indexes are being created in the background...
```

### Step 3: Monitor Index Creation

Index creation can take several minutes to hours depending on collection size:

```bash
# Check index status in Firebase Console
# Navigate to: Firestore Database > Indexes
```

**Index Status:**
- 🟡 **Building**: Index is being created (wait)
- 🟢 **Enabled**: Index is ready to use
- 🔴 **Error**: Index creation failed (check logs)

⚠️ **IMPORTANT**: Do NOT enable optimized queries until ALL indexes show "Enabled" status.

### Step 4: Verify Index Creation

Once all indexes show "Enabled", verify they work:

```bash
# Run index verification script
npm run test:indexes
```

Or manually test in Firebase Console:
1. Go to Firestore Database
2. Click on a collection (e.g., "posts")
3. Try a query with the indexed fields
4. Verify no "Index required" errors

---

## Phase 2: Enable Feature Flags

### Step 1: Configure Environment Variables

Add feature flags to your environment configuration:

```bash
# .env.local (for local testing)
VITE_ENABLE_QUERY_OPTIMIZATION=true
VITE_ENABLE_CACHE_MANAGER=true
VITE_ENABLE_BATCH_PROCESSOR=true
VITE_ENABLE_QUERY_MONITOR=true

# For production (Vercel/Firebase Hosting)
# Add these in your hosting platform's environment variables
```

### Step 2: Gradual Rollout Strategy

**Option A: All-at-once (Recommended for small user base)**
```typescript
// Enable all optimizations immediately
export const OPTIMIZATION_FLAGS = {
  queryOptimization: true,
  cacheManager: true,
  batchProcessor: true,
  queryMonitor: true,
};
```

**Option B: Gradual rollout (Recommended for large user base)**
```typescript
// Enable for percentage of users
export const OPTIMIZATION_FLAGS = {
  queryOptimization: shouldEnableForUser(userId, 0.1), // 10% of users
  cacheManager: true, // Safe to enable for all
  batchProcessor: true, // Safe to enable for all
  queryMonitor: true, // Safe to enable for all
};
```

### Step 3: Deploy Code Changes

```bash
# Build production bundle
npm run build

# Deploy to hosting
firebase deploy --only hosting

# Or deploy to Vercel
vercel --prod
```

---

## Phase 3: Testing and Validation

### Testing Checklist

#### 1. Posts Feed Testing

- [ ] **Initial Load**: Posts feed loads with 10 posts
- [ ] **Pagination**: Scroll to bottom loads next 10 posts
- [ ] **Real-time Updates**: New posts appear at top without refresh
- [ ] **Cache**: Second visit loads from cache (check Network tab)
- [ ] **Old Posts Filter**: Posts older than 18 hours are filtered out
- [ ] **Performance**: Feed loads in < 2 seconds

**Test Script:**
```javascript
// Open browser console on Posts page
console.log('Testing posts optimization...');

// Check cache
const cacheStats = window.__CACHE_STATS__;
console.log('Cache hit rate:', cacheStats.hitRate);

// Check query monitor
const queryStats = window.__QUERY_STATS__;
console.log('Average query time:', queryStats.avgTime);
console.log('Total reads:', queryStats.totalReads);
```

#### 2. Matching System Testing

- [ ] **Initial Load**: 50 profiles loaded
- [ ] **Filters**: Gender, major, academic year filters work
- [ ] **No Duplicates**: Already viewed profiles don't reappear
- [ ] **Cache**: Viewed profiles cached for 24 hours
- [ ] **Batch Save**: Match history saved in batches
- [ ] **Performance**: Matching loads in < 1.5 seconds

**Test Script:**
```javascript
// Test matching optimization
const matchingStats = window.__MATCHING_STATS__;
console.log('Profiles loaded:', matchingStats.profilesLoaded);
console.log('Cached profiles:', matchingStats.cachedCount);
console.log('Batch saves:', matchingStats.batchSaves);
```

#### 3. Messages Testing

- [ ] **Conversations List**: Loads 20 conversations
- [ ] **Messages Load**: Loads 30 messages per conversation
- [ ] **Real-time**: New messages appear instantly
- [ ] **Listener Switch**: Switching conversations unsubscribes from previous
- [ ] **Pagination**: Scroll up loads older messages
- [ ] **Performance**: Messages load in < 1 second

**Test Script:**
```javascript
// Test messages optimization
const messagesStats = window.__MESSAGES_STATS__;
console.log('Active listeners:', messagesStats.activeListeners);
console.log('Messages cached:', messagesStats.cachedMessages);
```

#### 4. Explore Places Testing

- [ ] **Mobile Load**: 100 places on mobile
- [ ] **Desktop Load**: 200 places on desktop
- [ ] **Category Filter**: Filters work at database level
- [ ] **Check-ins**: Expired check-ins filtered out
- [ ] **Events**: Past events filtered out
- [ ] **Cache**: Places cached for 5 minutes
- [ ] **Performance**: Map loads in < 2 seconds

#### 5. User Profiles Testing

- [ ] **Profile Load**: Profiles load from cache when available
- [ ] **Cache Duration**: Profiles cached for 3 minutes
- [ ] **Blocked Users**: Batch fetch works correctly
- [ ] **Favorites**: Lookup uses composite index
- [ ] **Performance**: Profile loads in < 500ms

#### 6. Online Status Testing

- [ ] **Status Display**: Online status shows correctly
- [ ] **Cache**: Status cached for 30 seconds
- [ ] **Listener Reuse**: No duplicate listeners
- [ ] **Cleanup**: Listeners unsubscribe on unmount
- [ ] **Performance**: Status updates in < 100ms

---

## Phase 4: Monitoring and Metrics

### Query Monitor Dashboard

Access the Query Monitor to track optimization impact:

```typescript
import { queryMonitor } from './utils/firestoreQueryMonitor';

// Get performance report
const report = queryMonitor.getReport();

console.log('Performance Report:', {
  totalQueries: report.totalQueries,
  totalReads: report.totalReads,
  cacheHitRate: report.cacheHitRate,
  avgExecutionTime: report.averageExecutionTime,
  costEstimate: report.costEstimate,
  slowQueries: report.slowQueries,
});
```

### Key Metrics to Monitor

#### 1. Document Reads Reduction

**Target**: 50% reduction in daily reads

```bash
# Check Firebase Console
# Firestore > Usage tab
# Compare "Document Reads" before and after
```

**Expected Results:**
- **Before**: 50,000+ reads/day
- **After**: 25,000 reads/day or less

#### 2. Cache Hit Rate

**Target**: 30%+ cache hit rate

```typescript
const cacheStats = cacheManager.getStats();
console.log('Cache hit rate:', cacheStats.hitRate);
// Expected: > 0.30 (30%)
```

#### 3. Query Execution Time

**Target**: < 2 seconds for all queries

```typescript
const slowQueries = queryMonitor.getSlowQueries(2000);
console.log('Slow queries (>2s):', slowQueries.length);
// Expected: 0 slow queries
```

#### 4. Cost Reduction

**Target**: 50% reduction in monthly costs

```bash
# Check Firebase Console
# Firestore > Usage > Billing
# Compare monthly costs before and after
```

**Expected Results:**
- **Before**: $X/month
- **After**: $X/2 or less

### Alerting Setup

Configure alerts for critical metrics:

```typescript
// In your monitoring setup
queryMonitor.on('highUsage', (reads) => {
  if (reads > 40000) {
    // Alert: Daily reads exceeding 80% of quota
    sendAlert('Firestore reads high', { reads });
  }
});

queryMonitor.on('slowQuery', (query) => {
  if (query.executionTime > 2000) {
    // Alert: Slow query detected
    sendAlert('Slow query detected', query);
  }
});
```

---

## Phase 5: Rollback Plan

If issues occur, follow this rollback procedure:

### Immediate Rollback (Disable Optimizations)

```bash
# Option 1: Disable via environment variables
VITE_ENABLE_QUERY_OPTIMIZATION=false

# Option 2: Revert to previous deployment
firebase hosting:rollback
# or
vercel rollback
```

### Partial Rollback (Disable Specific Features)

```typescript
// Disable only problematic features
export const OPTIMIZATION_FLAGS = {
  queryOptimization: false, // Disable if queries fail
  cacheManager: true, // Keep cache enabled
  batchProcessor: false, // Disable if writes fail
  queryMonitor: true, // Keep monitoring enabled
};
```

### Full Rollback (Revert All Changes)

```bash
# 1. Revert code changes
git revert [commit-hash]
git push origin main

# 2. Redeploy previous version
firebase deploy --only hosting

# 3. Restore Firestore data if needed
firebase firestore:import gs://[YOUR-BUCKET]/backups/pre-optimization-[date]
```

### Rollback Decision Matrix

| Issue | Severity | Action |
|-------|----------|--------|
| Slow queries (>5s) | High | Immediate rollback |
| Cache errors | Medium | Disable cache only |
| Batch write failures | Medium | Disable batch processor |
| Index errors | High | Check index status, may need rebuild |
| Cost increase | High | Immediate rollback + investigation |
| User complaints | Medium | Monitor + investigate |

---

## Troubleshooting Guide

### Issue 1: "Index Required" Errors

**Symptoms**: Queries fail with "The query requires an index" error

**Solution**:
1. Check index status in Firebase Console
2. Wait for indexes to finish building
3. If index shows "Error", delete and recreate:
   ```bash
   firebase deploy --only firestore:indexes
   ```

### Issue 2: Cache Not Working

**Symptoms**: Cache hit rate is 0% or very low

**Solution**:
1. Check cache configuration:
   ```typescript
   console.log(cacheManager.getStats());
   ```
2. Verify TTL settings are appropriate
3. Check if cache is being invalidated too frequently
4. Increase cache size if needed

### Issue 3: Duplicate Listeners

**Symptoms**: Multiple listeners for same query, high snapshot reads

**Solution**:
1. Check listener registry:
   ```typescript
   console.log(listenerManager.getActiveListeners());
   ```
2. Verify components are unsubscribing on unmount
3. Check for listener leaks in useEffect cleanup

### Issue 4: Batch Writes Failing

**Symptoms**: Match history or other batch operations not saving

**Solution**:
1. Check batch processor logs:
   ```typescript
   console.log(batchProcessor.getStats());
   ```
2. Verify batch size is not exceeding 500 operations
3. Check for individual operation errors
4. Retry failed operations manually

### Issue 5: High Query Costs

**Symptoms**: Costs not reduced or increased after optimization

**Solution**:
1. Check query monitor report:
   ```typescript
   const report = queryMonitor.getReport();
   console.log('Cost estimate:', report.costEstimate);
   ```
2. Identify top collections by reads
3. Verify limits are being applied
4. Check for query loops or excessive polling

---

## Post-Deployment Validation

### Week 1: Initial Monitoring

- [ ] Monitor Firebase Console daily for read counts
- [ ] Check error logs for any optimization-related errors
- [ ] Review user feedback and support tickets
- [ ] Verify cache hit rate is improving
- [ ] Check query execution times

### Week 2-4: Performance Analysis

- [ ] Generate performance comparison report
- [ ] Calculate actual cost savings
- [ ] Identify any remaining optimization opportunities
- [ ] Document lessons learned
- [ ] Update optimization parameters if needed

### Monthly Review

- [ ] Review monthly Firestore costs
- [ ] Analyze query patterns and trends
- [ ] Adjust cache TTLs based on usage patterns
- [ ] Update indexes if new query patterns emerge
- [ ] Plan next optimization phase

---

## Success Criteria

The deployment is considered successful when:

✅ **Performance Metrics**
- [ ] 50%+ reduction in daily document reads
- [ ] 30%+ cache hit rate
- [ ] All queries complete in < 2 seconds
- [ ] No "Index required" errors

✅ **Cost Metrics**
- [ ] 50%+ reduction in monthly Firestore costs
- [ ] Daily reads consistently under 30,000
- [ ] No unexpected cost spikes

✅ **User Experience**
- [ ] Faster page load times (2-3x improvement)
- [ ] No increase in error rates
- [ ] No user complaints about performance
- [ ] Real-time features still working correctly

✅ **System Health**
- [ ] All indexes showing "Enabled" status
- [ ] No memory leaks from cache or listeners
- [ ] Batch operations completing successfully
- [ ] Query monitor showing healthy metrics

---

## Support and Resources

### Documentation
- [Firestore Query Optimization Design Doc](.kiro/specs/firestore-query-optimization/design.md)
- [Requirements Document](.kiro/specs/firestore-query-optimization/requirements.md)
- [Implementation Tasks](.kiro/specs/firestore-query-optimization/tasks.md)

### Code References
- Cache Manager: `src/utils/firestoreCacheManager.ts`
- Query Optimizer: `src/utils/firestoreQueryOptimizer.ts`
- Listener Manager: `src/utils/firestoreListenerManager.ts`
- Query Monitor: `src/utils/firestoreQueryMonitor.ts`

### Firebase Resources
- [Firestore Indexes Documentation](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Firestore Pricing](https://firebase.google.com/pricing)
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices)

### Contact
For issues or questions during deployment:
- Check Firebase Console logs
- Review Query Monitor dashboard
- Consult development team
- Refer to troubleshooting guide above

---

## Appendix: Quick Reference Commands

```bash
# Deploy indexes
firebase deploy --only firestore:indexes

# Check index status
firebase firestore:indexes

# Export Firestore data (backup)
firebase firestore:export gs://[BUCKET]/backups/$(date +%Y%m%d)

# Import Firestore data (restore)
firebase firestore:import gs://[BUCKET]/backups/[DATE]

# Deploy hosting
firebase deploy --only hosting

# Rollback hosting
firebase hosting:rollback

# View Firebase logs
firebase functions:log

# Test production build locally
npm run build && npm run preview
```

---

**Last Updated**: April 2026  
**Version**: 1.0  
**Status**: Ready for Production Deployment
