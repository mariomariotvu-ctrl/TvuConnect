# Firebase Console Monitoring Guide
## How to Track Firestore Reads for Task 3.6

---

## Quick Start

**Goal:** Track daily Firestore reads to verify 68% reduction (25K → 8K reads/day)

**Time Required:** 5 minutes/day for 7 days

**Tools Needed:**
- Firebase Console access
- Spreadsheet (Google Sheets or Excel)
- Browser DevTools (for local testing)

---

## Step 1: Access Firebase Console

### 1.1 Login to Firebase
```
1. Go to: https://console.firebase.google.com/
2. Sign in with your Google account
3. Select project: "tvu-connect-v2" (or your project name)
```

### 1.2 Navigate to Firestore Usage
```
1. In left sidebar, click "Firestore Database"
2. Click on "Usage" tab at the top
3. You should see a dashboard with metrics
```

---

## Step 2: Understanding the Usage Dashboard

### 2.1 Key Metrics

**Document Reads**
- Shows total reads per day
- Includes all collections (posts, users, messages, etc.)
- Graph shows last 30 days by default

**Document Writes**
- Shows total writes per day
- Not relevant for this task (we're optimizing reads)

**Document Deletes**
- Shows total deletes per day
- Not relevant for this task

### 2.2 Reading the Graph

```
Example Graph:

Reads
30K ┤     ╭─╮
25K ┤   ╭─╯ ╰─╮
20K ┤ ╭─╯     ╰─╮
15K ┤─╯         ╰─╮
10K ┤             ╰─╮  ← After optimization
 5K ┤               ╰─
    └─────────────────────
    Day 1  ...  Day 7
```

**What to look for:**
- Downward trend after optimization deployed
- Stabilization around 8K reads/day
- No sudden spikes (indicates issues)

---

## Step 3: Daily Monitoring Routine

### 3.1 Daily Checklist (5 minutes)

**Every day at the same time (e.g., 9:00 AM):**

1. ✅ Open Firebase Console → Firestore → Usage
2. ✅ Note today's total reads (hover over graph)
3. ✅ Record in tracking spreadsheet
4. ✅ Check for any anomalies or spikes
5. ✅ Review error logs (if reads are higher than expected)

### 3.2 Tracking Spreadsheet Template

Create a Google Sheet with this structure:

| Date | Total Reads | Posts Reads (Est.) | Cache Hit Rate | Notes |
|------|-------------|-------------------|----------------|-------|
| 2026-04-16 | 24,500 | ~8,000 | ~67% | First day after deploy |
| 2026-04-17 | 23,800 | ~7,800 | ~69% | Stable |
| 2026-04-18 | 22,100 | ~7,200 | ~71% | Weekend - lower traffic |
| 2026-04-19 | 21,900 | ~7,100 | ~72% | Weekend - lower traffic |
| 2026-04-20 | 25,200 | ~8,200 | ~67% | Monday - higher traffic |
| 2026-04-21 | 24,800 | ~8,000 | ~68% | Stable |
| 2026-04-22 | 24,300 | ~7,900 | ~68% | Stable |
| **Average** | **23,800** | **~7,743** | **~69%** | **✅ Target met** |

**Formulas:**
```
Average Total Reads: =AVERAGE(B2:B8)
Average Posts Reads: =AVERAGE(C2:C8)
Average Cache Hit Rate: =AVERAGE(D2:D8)
```

### 3.3 Estimating Posts Reads

Since Firebase doesn't show per-collection reads, estimate using:

```typescript
// Method 1: Proportion Method
// If posts were 30% of total reads before optimization:
const totalReads = 24500; // From Firebase Console
const postsReadsProportion = 0.30;
const estimatedPostsReads = totalReads * postsReadsProportion;
// Result: ~7,350 reads

// Method 2: User Activity Method
// Based on active users and average behavior:
const activeUsers = 100;
const avgFeedChecksPerUser = 8;
const readsPerCheck = 10; // limit 10
const cacheHitRate = 0.68; // 68%
const estimatedPostsReads = activeUsers * avgFeedChecksPerUser * readsPerCheck * (1 - cacheHitRate);
// Result: 100 * 8 * 10 * 0.32 = 2,560 reads (very optimistic)

// Method 3: Console Logs Method (Most Accurate)
// Check browser console for actual cache hit/miss logs
// Count fromCache: true vs false over sample period
```

---

## Step 4: Detailed Monitoring (Optional)

### 4.1 Enable Firestore Monitoring in Google Cloud

For more detailed metrics:

```
1. Go to: https://console.cloud.google.com/
2. Select project: tvu-connect-v2
3. Navigate to: Firestore → Monitoring
4. View detailed metrics:
   - Read operations by collection
   - Read operations by time
   - Peak usage analysis
```

### 4.2 Set Up Alerts

**Create alert for high reads:**

```
1. In Google Cloud Console → Monitoring → Alerting
2. Click "Create Policy"
3. Configure:
   - Metric: Firestore Document Reads
   - Condition: > 40,000 reads/day
   - Notification: Email to your address
4. Save policy
```

### 4.3 Custom Analytics (Advanced)

Add tracking to `useCachedPosts.ts`:

```typescript
// Add after each query
import { logEvent } from 'firebase/analytics';

// Log cache hit
if (result.fromCache) {
  logEvent(analytics, 'posts_cache_hit', {
    timestamp: Date.now(),
    responseTime: result.executionTime,
  });
} else {
  logEvent(analytics, 'posts_cache_miss', {
    timestamp: Date.now(),
    documentReads: result.documentReads,
    responseTime: result.executionTime,
  });
}
```

Then view in Firebase Console → Analytics → Events.

---

## Step 5: Local Testing Verification

### 5.1 Browser DevTools Method

**Test cache behavior locally:**

```javascript
// 1. Open DevTools (F12)
// 2. Go to Console tab
// 3. Navigate to Posts Feed
// 4. Look for logs:

[useCachedPosts] Initial load: {
  fromCache: false,
  executionTime: 847,
  documentReads: 10,
  postCount: 10
}

// 5. Refresh page (within 60s)
// 6. Look for:

[useCachedPosts] Initial load: {
  fromCache: true,
  executionTime: 12,
  documentReads: 0,
  postCount: 10
}
```

### 5.2 Session Storage Inspection

**Check cache in DevTools:**

```javascript
// 1. Open DevTools → Application tab
// 2. Expand "Session Storage" in left sidebar
// 3. Click on your domain
// 4. Look for key: "posts:feed"
// 5. Click to view value:

{
  "data": [...], // Array of posts
  "timestamp": 1713254400000,
  "ttl": 60000,
  "lastDoc": {...}
}

// 6. Calculate cache age:
const cache = JSON.parse(sessionStorage.getItem('posts:feed'));
const ageSeconds = (Date.now() - cache.timestamp) / 1000;
console.log('Cache age:', ageSeconds, 'seconds');
console.log('Expired:', ageSeconds > 60);
```

### 5.3 Network Tab Monitoring

**Monitor Firestore requests:**

```
1. Open DevTools → Network tab
2. Filter by "firestore.googleapis.com"
3. Navigate to Posts Feed
4. Observe:
   - First load: 1 request to Firestore
   - Refresh within 60s: 0 requests (cache hit)
   - Refresh after 60s: 1 request (cache miss)
```

---

## Step 6: Calculating Results

### 6.1 Reduction Percentage Formula

```typescript
// After 7 days of monitoring
const baselineReadsPerDay = 25000; // Before optimization
const measuredReads = [24500, 23800, 22100, 21900, 25200, 24800, 24300];
const averageReadsPerDay = measuredReads.reduce((a, b) => a + b) / measuredReads.length;

// Calculate reduction
const readsReduced = baselineReadsPerDay - averageReadsPerDay;
const reductionPercentage = (readsReduced / baselineReadsPerDay) * 100;

console.log({
  baseline: baselineReadsPerDay,
  measured: averageReadsPerDay.toFixed(0),
  reduced: readsReduced.toFixed(0),
  percentage: reductionPercentage.toFixed(2) + '%',
  target: '68%',
  success: reductionPercentage >= 68 ? '✅ TARGET MET' : '❌ BELOW TARGET'
});

// Example output:
// {
//   baseline: 25000,
//   measured: "23800",
//   reduced: "1200",
//   percentage: "4.80%",
//   target: "68%",
//   success: "❌ BELOW TARGET"
// }
```

**Note:** This example shows total reads reduction. For posts-specific reduction, use estimated posts reads.

### 6.2 Success Criteria

**Target Met (✅):**
```
Reduction ≥ 68%
Average reads ≤ 8,000/day
Cache hit rate ≥ 60%
No increase in errors
```

**Partial Success (⚠️):**
```
Reduction 50-67%
Average reads 8,000-12,500/day
Cache hit rate 40-59%
Minor error increase (<5%)
```

**Target Not Met (❌):**
```
Reduction < 50%
Average reads > 12,500/day
Cache hit rate < 40%
Significant error increase (>5%)
```

---

## Step 7: Troubleshooting

### 7.1 Reads Not Decreasing

**Possible causes:**
1. Cache not working (check browser console)
2. TTL too short (users refresh after expiration)
3. High new user traffic (no cache benefit)
4. Multiple tabs/devices (separate caches)

**Actions:**
- Review console logs for cache hit/miss ratio
- Check session storage for 'posts:feed' key
- Verify queryOptimizer implementation
- Consider increasing TTL to 120s

### 7.2 Reads Higher Than Expected

**Possible causes:**
1. Increased user activity
2. Bot traffic
3. Cache invalidation too aggressive
4. Pagination heavy usage

**Actions:**
- Check Firebase Analytics for user count
- Review user behavior patterns
- Adjust cache invalidation logic
- Monitor pagination usage

### 7.3 Cache Not Persisting

**Possible causes:**
1. Browser in incognito mode
2. Session storage disabled
3. Storage quota exceeded
4. Browser extensions interfering

**Actions:**
- Test in normal browser mode
- Check browser settings
- Clear session storage
- Disable extensions temporarily

---

## Step 8: Reporting

### 8.1 Weekly Report Template

```markdown
# Week 1 Monitoring Report - Posts Feed Optimization

## Summary
- **Monitoring Period:** 2026-04-16 to 2026-04-22 (7 days)
- **Baseline:** 25,000 reads/day
- **Measured:** [FILL] reads/day
- **Reduction:** [FILL]%
- **Status:** [✅/⚠️/❌]

## Daily Metrics
[Insert spreadsheet table]

## Analysis
- **Peak Day:** [FILL] with [FILL] reads
- **Low Day:** [FILL] with [FILL] reads
- **Average:** [FILL] reads/day
- **Cache Hit Rate:** [FILL]%

## Observations
- [FILL with notable patterns]
- [FILL with any issues encountered]
- [FILL with user feedback]

## Recommendations
- [FILL with next steps]

## Conclusion
[FILL with summary]
```

### 8.2 Screenshot Checklist

**Required screenshots:**
- [ ] Firebase Console Usage graph (before optimization)
- [ ] Firebase Console Usage graph (after optimization)
- [ ] Browser DevTools showing cache hit
- [ ] Browser DevTools showing cache miss
- [ ] Session Storage with 'posts:feed' key
- [ ] Network tab showing reduced requests
- [ ] Console logs showing cache performance

---

## Quick Reference

### Daily Monitoring (5 min)
1. Open Firebase Console → Firestore → Usage
2. Record today's total reads
3. Update tracking spreadsheet
4. Check for anomalies

### Weekly Analysis (30 min)
1. Calculate average daily reads
2. Calculate reduction percentage
3. Review trends and patterns
4. Create weekly report
5. Share findings with team

### Success Criteria
- ✅ Reads ≤ 8,000/day
- ✅ Reduction ≥ 68%
- ✅ Cache hit rate ≥ 60%
- ✅ No error increase

---

## Resources

**Firebase Console:**
- https://console.firebase.google.com/

**Google Cloud Console:**
- https://console.cloud.google.com/

**Firebase Documentation:**
- https://firebase.google.com/docs/firestore/quotas

**Monitoring Best Practices:**
- https://firebase.google.com/docs/firestore/best-practices

---

**Document Version:** 1.0
**Created:** 2026-04-16
**Task:** 3.6 Firebase Console Monitoring Guide
**Purpose:** Track Firestore reads reduction for Posts Feed optimization
