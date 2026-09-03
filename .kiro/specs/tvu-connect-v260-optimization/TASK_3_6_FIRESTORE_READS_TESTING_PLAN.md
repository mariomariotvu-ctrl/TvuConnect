# Task 3.6 - Firestore Reads Testing & Verification Plan

## Objective
Test and verify that Firestore reads for Posts Feed have been reduced from ~25K/day to ~8K/day (68% reduction) through the implementation of cache-first strategy with 60-second TTL.

## Status: 🔄 READY FOR TESTING

---

## 1. Testing Strategy Overview

### 1.1 Testing Approach
We will use a **multi-phase approach** to verify the read reduction:

1. **Phase 1: Baseline Measurement** (Before optimization - Historical data)
2. **Phase 2: Local Testing** (Verify cache behavior works correctly)
3. **Phase 3: Production Monitoring** (7-day observation period)
4. **Phase 4: Analysis & Reporting** (Calculate actual reduction)

### 1.2 Success Criteria
- ✅ Cache hit rate > 60% for posts feed
- ✅ Firestore reads reduced from ~25K/day to ~8K/day
- ✅ Reduction percentage ≥ 68%
- ✅ No degradation in user experience
- ✅ No increase in error rates

---

## 2. Phase 1: Baseline Measurement

### 2.1 Historical Data (Before Optimization)

**Estimated Baseline (Pre-optimization):**
- **Daily Firestore Reads:** ~25,000 reads/day
- **Average Users:** ~100 active users/day
- **Reads per User:** ~250 reads/user/day
- **Feed Refresh Pattern:** Every page load, every navigation back to feed

**Assumptions:**
- Users check feed 5-10 times per day
- Each feed load fetches 10 posts = 10 reads
- No caching = every load triggers Firestore query
- Calculation: 100 users × 10 checks × 10 reads = 10,000 reads (conservative)
- With navigation patterns and refreshes: ~25,000 reads/day

### 2.2 How to Access Historical Data

**Option 1: Firebase Console**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `tvu-connect-v2`
3. Navigate to **Firestore Database** → **Usage** tab
4. View historical read metrics for past 30 days
5. Screenshot the graph showing reads before optimization

**Option 2: Firebase CLI**
```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Get usage stats
firebase projects:list
firebase firestore:usage --project tvu-connect-v2
```

**Option 3: Google Cloud Console**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: `tvu-connect-v2`
3. Navigate to **Firestore** → **Monitoring**
4. View detailed metrics including:
   - Document reads per day
   - Read operations by collection
   - Peak usage times

---

## 3. Phase 2: Local Testing

### 3.1 Cache Behavior Verification

**Test 1: Initial Load (Cache Miss)**
```typescript
// Expected behavior:
// 1. First load → Firestore query (10 reads)
// 2. Data cached in sessionStorage with key 'posts:feed'
// 3. TTL set to 60 seconds

// How to test:
1. Open browser DevTools → Application → Session Storage
2. Clear all session storage
3. Navigate to Posts Feed
4. Observe:
   - Console log: "[useCachedPosts] Initial load: { fromCache: false, documentReads: 10 }"
   - Session Storage: Key 'posts:feed' created with timestamp
5. Check Firebase Console → Firestore → Usage (should show 10 reads)
```

**Test 2: Subsequent Load Within TTL (Cache Hit)**
```typescript
// Expected behavior:
// 1. Load within 60s → Data from sessionStorage (0 reads)
// 2. Instant response, no Firestore query

// How to test:
1. After Test 1, refresh the page (within 60 seconds)
2. Observe:
   - Console log: "[useCachedPosts] Initial load: { fromCache: true, documentReads: 0 }"
   - No new Firestore reads in Firebase Console
   - Posts display instantly (< 50ms)
3. Verify session storage still has 'posts:feed' key
```

**Test 3: Load After TTL Expiration (Cache Miss)**
```typescript
// Expected behavior:
// 1. Wait > 60s → Cache expired
// 2. Next load → Firestore query (10 reads)
// 3. Cache refreshed with new timestamp

// How to test:
1. After Test 2, wait 61 seconds
2. Refresh the page
3. Observe:
   - Console log: "[useCachedPosts] Initial load: { fromCache: false, documentReads: 10 }"
   - New Firestore reads in Firebase Console
   - Session storage 'posts:feed' updated with new timestamp
```

**Test 4: Pagination (No Cache)**
```typescript
// Expected behavior:
// 1. Click "Load More" → Firestore query (10 reads)
// 2. Pagination results NOT cached (dynamic data)

// How to test:
1. Load posts feed (initial 10 posts)
2. Scroll down and click "Xem thêm" button
3. Observe:
   - Console log: "[useCachedPosts] Load more: { documentReads: 10 }"
   - New Firestore reads in Firebase Console
   - 10 more posts appended to feed
```

**Test 5: Cache Invalidation on New Post**
```typescript
// Expected behavior:
// 1. Create new post → Cache invalidated
// 2. Feed refreshes → Firestore query (10 reads)
// 3. New post appears at top

// How to test:
1. Load posts feed (cache hit)
2. Create a new post
3. Observe:
   - onPostCreated callback triggers refresh()
   - Console log: "[useCachedPosts] Initial load: { fromCache: false }"
   - New Firestore reads in Firebase Console
   - New post appears at top of feed
```

### 3.2 Local Testing Checklist

- [ ] Test 1: Initial load (cache miss) ✅
- [ ] Test 2: Subsequent load within TTL (cache hit) ✅
- [ ] Test 3: Load after TTL expiration (cache miss) ✅
- [ ] Test 4: Pagination (no cache) ✅
- [ ] Test 5: Cache invalidation on new post ✅
- [ ] Verify no console errors
- [ ] Verify no TypeScript errors
- [ ] Verify UI/UX unchanged
- [ ] Verify loading states work correctly

### 3.3 Expected Local Test Results

| Test | Firestore Reads | Cache Hit | Response Time |
|------|----------------|-----------|---------------|
| Initial Load | 10 | ❌ | ~500-1000ms |
| Within TTL | 0 | ✅ | ~10-50ms |
| After TTL | 10 | ❌ | ~500-1000ms |
| Pagination | 10 | ❌ | ~500-1000ms |
| After New Post | 10 | ❌ | ~500-1000ms |

**Cache Hit Rate (Local):** 
- If user refreshes 5 times within 60s: 1 miss + 4 hits = 80% hit rate
- Firestore reads: 10 (initial) + 0 + 0 + 0 + 0 = 10 reads (vs 50 without cache)
- **Reduction: 80%** ✅

---

## 4. Phase 3: Production Monitoring

### 4.1 Monitoring Period
**Duration:** 7 days (1 week)
**Start Date:** [To be filled when deployed]
**End Date:** [To be filled]

### 4.2 Metrics to Track

**Primary Metrics:**
1. **Total Firestore Reads/Day**
   - Target: < 8,000 reads/day
   - Baseline: ~25,000 reads/day
   - Reduction: ≥ 68%

2. **Cache Hit Rate**
   - Target: > 60%
   - Measure: (Cache Hits / Total Requests) × 100

3. **Average Response Time**
   - Cache Hit: < 100ms
   - Cache Miss: < 1000ms

**Secondary Metrics:**
4. **Error Rate**
   - Target: < 1%
   - Monitor: QuotaExceededError, Firestore errors

5. **User Experience**
   - Page Load Time (LCP)
   - Time to Interactive (TTI)
   - User feedback/complaints

### 4.3 How to Monitor in Firebase Console

**Step 1: Access Firestore Usage Dashboard**
```
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select project: tvu-connect-v2
3. Navigate to: Firestore Database → Usage tab
4. View metrics:
   - Document reads (daily)
   - Document writes (daily)
   - Document deletes (daily)
```

**Step 2: Set Up Daily Monitoring**
```
Create a spreadsheet to track daily metrics:

| Date | Total Reads | Posts Reads | Cache Hit Rate | Notes |
|------|-------------|-------------|----------------|-------|
| Day 1 | [Fill] | [Fill] | [Fill] | [Fill] |
| Day 2 | [Fill] | [Fill] | [Fill] | [Fill] |
| ... | ... | ... | ... | ... |
| Day 7 | [Fill] | [Fill] | [Fill] | [Fill] |
```

**Step 3: Calculate Posts Feed Reads**
```typescript
// Since Firebase doesn't show per-collection reads directly,
// we need to estimate based on:

// Method 1: Console Logs (Development)
// - Check browser console for "[useCachedPosts]" logs
// - Count fromCache: true vs false
// - Calculate hit rate

// Method 2: Custom Analytics (Production)
// - Add analytics tracking to useCachedPosts hook
// - Send metrics to Firebase Analytics or custom endpoint
// - Dashboard shows real-time cache performance

// Method 3: Firestore Rules Monitoring
// - Monitor Firestore rules logs
// - Count read operations on 'posts' collection
// - Compare before/after optimization
```

### 4.4 Production Monitoring Checklist

**Daily Tasks (7 days):**
- [ ] Day 1: Record total Firestore reads
- [ ] Day 2: Record total Firestore reads
- [ ] Day 3: Record total Firestore reads
- [ ] Day 4: Record total Firestore reads
- [ ] Day 5: Record total Firestore reads
- [ ] Day 6: Record total Firestore reads
- [ ] Day 7: Record total Firestore reads
- [ ] Calculate average daily reads
- [ ] Calculate reduction percentage
- [ ] Compare with baseline (25K/day)

**Weekly Tasks:**
- [ ] Review error logs
- [ ] Check user feedback
- [ ] Analyze peak usage times
- [ ] Identify any anomalies
- [ ] Document findings

---

## 5. Phase 4: Analysis & Reporting

### 5.1 Data Analysis Template

**Calculation Formula:**
```typescript
// Baseline (Before Optimization)
const baselineReadsPerDay = 25000;

// Measured (After Optimization)
const measuredReadsPerDay = [/* Fill with actual data */];
const averageReadsPerDay = measuredReadsPerDay.reduce((a, b) => a + b) / measuredReadsPerDay.length;

// Reduction Calculation
const readsReduced = baselineReadsPerDay - averageReadsPerDay;
const reductionPercentage = (readsReduced / baselineReadsPerDay) * 100;

// Success Check
const targetReduction = 68; // 68%
const success = reductionPercentage >= targetReduction;

console.log({
  baseline: baselineReadsPerDay,
  measured: averageReadsPerDay,
  reduced: readsReduced,
  percentage: reductionPercentage.toFixed(2) + '%',
  target: targetReduction + '%',
  success: success ? '✅ TARGET MET' : '❌ TARGET NOT MET'
});
```

### 5.2 Expected Results

**Optimistic Scenario (Best Case):**
```
Baseline: 25,000 reads/day
Measured: 7,000 reads/day
Reduction: 18,000 reads/day (72%)
Status: ✅ EXCEEDS TARGET (68%)
```

**Target Scenario (Expected):**
```
Baseline: 25,000 reads/day
Measured: 8,000 reads/day
Reduction: 17,000 reads/day (68%)
Status: ✅ MEETS TARGET (68%)
```

**Conservative Scenario (Acceptable):**
```
Baseline: 25,000 reads/day
Measured: 10,000 reads/day
Reduction: 15,000 reads/day (60%)
Status: ⚠️ BELOW TARGET but significant improvement
```

**Failure Scenario (Needs Investigation):**
```
Baseline: 25,000 reads/day
Measured: 20,000 reads/day
Reduction: 5,000 reads/day (20%)
Status: ❌ DOES NOT MEET TARGET
Action: Investigate cache implementation, TTL settings, user behavior
```

### 5.3 Cost Savings Calculation

**Firebase Pricing (Firestore Reads):**
- Free tier: 50,000 reads/day
- Paid tier: $0.06 per 100,000 reads

**Monthly Savings:**
```typescript
// Reads saved per day
const readsSavedPerDay = 17000; // 25K - 8K

// Reads saved per month
const readsSavedPerMonth = readsSavedPerDay * 30; // 510,000 reads

// Cost savings (if over free tier)
const costPerRead = 0.06 / 100000; // $0.0000006 per read
const monthlySavings = readsSavedPerMonth * costPerRead;

console.log({
  readsSavedPerMonth: readsSavedPerMonth.toLocaleString(),
  monthlySavings: '$' + monthlySavings.toFixed(2),
  yearlySavings: '$' + (monthlySavings * 12).toFixed(2)
});

// Example output:
// {
//   readsSavedPerMonth: "510,000",
//   monthlySavings: "$0.31",
//   yearlySavings: "$3.67"
// }
```

**Note:** While the direct cost savings may seem small, the real value is:
1. **Scalability:** As user base grows, savings multiply
2. **Free Tier Headroom:** Stay within free tier longer
3. **Performance:** Faster response times improve UX
4. **Reliability:** Less dependency on Firestore availability

---

## 6. Verification Report Template

### 6.1 Report Structure

```markdown
# Firestore Reads Reduction Verification Report
## Task 3.6 - Posts Feed Optimization

### Executive Summary
- **Optimization:** Cache-first strategy with 60s TTL
- **Target:** Reduce reads from 25K/day to 8K/day (68%)
- **Result:** [FILL] reads/day ([FILL]% reduction)
- **Status:** [✅ SUCCESS / ⚠️ PARTIAL / ❌ FAILED]

### Baseline Metrics (Before Optimization)
- Daily Firestore Reads: 25,000
- Cache Hit Rate: 0%
- Average Response Time: ~800ms

### Measured Metrics (After Optimization)
- Daily Firestore Reads: [FILL]
- Cache Hit Rate: [FILL]%
- Average Response Time: [FILL]ms

### Detailed Analysis
[FILL with 7-day data table]

### Cost Impact
- Reads Saved: [FILL] reads/day
- Monthly Savings: $[FILL]
- Yearly Savings: $[FILL]

### User Experience Impact
- Page Load Time: [FILL]% improvement
- Error Rate: [FILL]%
- User Feedback: [FILL]

### Recommendations
[FILL with next steps]

### Conclusion
[FILL with summary]
```

### 6.2 Supporting Documentation

**Required Attachments:**
1. Firebase Console screenshots (before/after)
2. Browser DevTools screenshots (cache behavior)
3. Console logs (cache hit/miss patterns)
4. Performance metrics (LCP, FID, CLS)
5. Error logs (if any)
6. User feedback (if any)

---

## 7. Troubleshooting Guide

### 7.1 Common Issues

**Issue 1: Cache Not Working**
```
Symptoms:
- fromCache always false
- Every load triggers Firestore query
- No 'posts:feed' key in sessionStorage

Diagnosis:
1. Check browser supports sessionStorage
2. Check sessionStorage not full (5MB limit)
3. Check cache TTL not set to 0
4. Check queryOptimizer implementation

Solution:
- Clear sessionStorage and retry
- Check browser console for errors
- Verify cacheConfig is correct
- Review queryOptimizer.ts implementation
```

**Issue 2: Cache Hit Rate Too Low**
```
Symptoms:
- Cache hit rate < 30%
- More Firestore reads than expected

Diagnosis:
1. Check user behavior (frequent refreshes?)
2. Check TTL too short (60s may be too short)
3. Check cache invalidation too aggressive
4. Check multiple tabs/windows

Solution:
- Increase TTL to 120s (test)
- Review cache invalidation logic
- Add cross-tab cache sync
- Monitor user navigation patterns
```

**Issue 3: Stale Data**
```
Symptoms:
- New posts not appearing
- Cache showing old data
- Users complaining about outdated content

Diagnosis:
1. Check cache invalidation on new post
2. Check TTL too long
3. Check refresh() function working

Solution:
- Verify onPostCreated calls refresh()
- Reduce TTL if needed
- Add manual refresh button
- Implement real-time updates for critical data
```

**Issue 4: Storage Quota Exceeded**
```
Symptoms:
- QuotaExceededError in console
- Cache not saving
- Intermittent failures

Diagnosis:
1. Check sessionStorage size
2. Check other apps using storage
3. Check cache eviction not working

Solution:
- Implement LRU eviction (already in cacheManager)
- Clear old cache entries
- Use localStorage for persistent data only
- Monitor storage usage
```

### 7.2 Debugging Commands

**Check Cache in Browser Console:**
```javascript
// View all session storage
console.table(Object.entries(sessionStorage));

// View posts cache specifically
const postsCache = sessionStorage.getItem('posts:feed');
console.log('Posts Cache:', JSON.parse(postsCache));

// Check cache age
const cache = JSON.parse(sessionStorage.getItem('posts:feed'));
const age = Date.now() - cache.timestamp;
console.log('Cache age (seconds):', age / 1000);

// Check if cache expired
const ttl = 60000; // 60 seconds
const expired = age > ttl;
console.log('Cache expired:', expired);
```

**Monitor Firestore Reads:**
```javascript
// Add to useCachedPosts.ts for debugging
let totalReads = 0;
let cacheHits = 0;
let cacheMisses = 0;

// After each query
if (result.fromCache) {
  cacheHits++;
} else {
  cacheMisses++;
  totalReads += result.documentReads;
}

console.log('Cache Stats:', {
  totalReads,
  cacheHits,
  cacheMisses,
  hitRate: ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(2) + '%'
});
```

---

## 8. Next Steps

### 8.1 Immediate Actions
1. ✅ Review this testing plan
2. ⏳ Execute Phase 2 (Local Testing)
3. ⏳ Deploy to production
4. ⏳ Execute Phase 3 (Production Monitoring)
5. ⏳ Execute Phase 4 (Analysis & Reporting)

### 8.2 After Verification
1. Document actual results in TASK_3_6_VERIFICATION_REPORT.md
2. Update tasks.md to mark task 3.6 as complete
3. Proceed to task 3.7 (Documentation)
4. Share findings with team
5. Apply learnings to other optimization tasks (Matching, Messages, etc.)

### 8.3 Future Enhancements
1. **Real-time Cache Metrics Dashboard**
   - Build admin dashboard showing cache performance
   - Track hit rate, response time, reads saved
   - Alert on anomalies

2. **Adaptive TTL**
   - Adjust TTL based on user behavior
   - Longer TTL during low activity
   - Shorter TTL during high activity

3. **Predictive Prefetching**
   - Prefetch next page on idle
   - Preload likely-to-be-viewed posts
   - Smart cache warming

4. **Cross-Tab Cache Sync**
   - Sync cache across browser tabs
   - Use BroadcastChannel API
   - Reduce duplicate reads

---

## 9. Acceptance Criteria Checklist

From Requirement 1 (Cache-First Strategy cho Posts Feed):

- [x] **1.1** Cache_Manager checks sessionStorage first before querying Firestore
- [x] **1.2** Cache_Manager caches posts feed with TTL 60 seconds
- [x] **1.3** System returns data instantly on cache hit
- [x] **1.4** Query_Optimizer fetches from Firestore with limit 10 on cache miss
- [x] **1.5** Query_Optimizer uses pagination with startAfter cursor
- [ ] **1.6** System reduces Posts Feed reads from ~25K/day to ~8K/day (68% reduction) ⬅️ **THIS TASK**
- [x] **1.7** Cache_Manager stores cache key as 'posts:feed' in sessionStorage

**Task 3.6 Focus:** Verify acceptance criteria 1.6 through testing and monitoring.

---

## 10. Conclusion

This testing plan provides a comprehensive approach to verify the Firestore reads reduction for Posts Feed. By following the 4-phase methodology (Baseline → Local Testing → Production Monitoring → Analysis), we can confidently measure the impact of the cache-first optimization and ensure we meet the 68% reduction target.

**Key Success Factors:**
1. ✅ Thorough local testing before production
2. ✅ 7-day monitoring period for statistical significance
3. ✅ Clear metrics and success criteria
4. ✅ Troubleshooting guide for common issues
5. ✅ Detailed reporting template

**Expected Outcome:**
- Firestore reads reduced from 25K/day to 8K/day
- 68% reduction achieved
- Improved user experience (faster load times)
- Cost savings and scalability improvements

---

**Document Version:** 1.0
**Created:** 2026-04-16
**Task:** 3.6 Test và verify reads giảm từ 25K → 8K/day
**Status:** 🔄 READY FOR TESTING
