# Query Monitor Integration Guide

This guide shows how to integrate the QueryMonitor with existing Firestore optimization infrastructure.

## Quick Start

### 1. Initialize Global Monitor

Add this to your app initialization (e.g., `src/main.tsx` or `src/App.tsx`):

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

// Initialize monitor on app startup
const monitor = getQueryMonitor({
  dailyQuota: 50000,
  baselineReads: 50000,
  alertThreshold: 0.8,
  slowQueryThreshold: 2000,
  onAlert: (alert) => {
    console.error('Firestore usage alert:', alert);
    // TODO: Send to monitoring service
  },
});

console.log('QueryMonitor initialized');
```

### 2. Integrate with Query Optimizer

Update `src/utils/firestoreQueryOptimizer.ts` to log metrics:

```typescript
import { getQueryMonitor } from './firestoreQueryMonitor';

export class QueryOptimizer {
  async executeQuery<T>(config: QueryOptimizerConfig): Promise<QueryResult<T>> {
    const monitor = getQueryMonitor();
    const startTime = Date.now();
    const queryId = `${config.collection}-${Date.now()}`;
    
    try {
      // Check cache first
      if (config.useCache) {
        const cached = this.cacheManager.get<T[]>(cacheKey);
        if (cached) {
          // Log cached query
          monitor.logQuery({
            queryId,
            collection: config.collection,
            executionTime: Date.now() - startTime,
            documentReads: cached.length,
            fromCache: true,
            timestamp: Date.now(),
            operation: 'read',
            limit: config.limit,
          });
          
          return {
            data: cached,
            lastDoc: null,
            hasMore: false,
            fromCache: true,
            executionTime: Date.now() - startTime,
          };
        }
      }
      
      // Execute Firestore query
      const query = this.buildQuery(config);
      const snapshot = await getDocs(query);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
      
      // Log Firestore query
      monitor.logQuery({
        queryId,
        collection: config.collection,
        executionTime: Date.now() - startTime,
        documentReads: snapshot.size,
        fromCache: false,
        timestamp: Date.now(),
        operation: 'read',
        limit: config.limit,
        filters: config.where?.map(w => `${w.field}${w.operator}${w.value}`),
      });
      
      // Cache results
      if (config.useCache) {
        this.cacheManager.set(cacheKey, data, config.cacheTTL);
      }
      
      return {
        data,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
        hasMore: snapshot.docs.length === config.limit,
        fromCache: false,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Query execution error:', error);
      throw error;
    }
  }
}
```

### 3. Integrate with Listener Manager

Update `src/utils/firestoreListenerManager.ts` to track listener reads:

```typescript
import { getQueryMonitor } from './firestoreQueryMonitor';

export class ListenerManager {
  subscribe(id: string, config: ListenerConfig): string {
    const monitor = getQueryMonitor();
    
    // ... existing subscription logic ...
    
    const unsubscribe = onSnapshot(
      config.query,
      (snapshot) => {
        // Log listener snapshot
        monitor.logQuery({
          queryId: `listener-${id}-${Date.now()}`,
          collection: id.split('-')[0], // Extract collection from ID
          executionTime: 0, // Listeners don't have execution time
          documentReads: snapshot.size,
          fromCache: snapshot.metadata.fromCache,
          timestamp: Date.now(),
          operation: 'listen',
          limit: config.limit,
        });
        
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        config.onUpdate(data);
      },
      config.onError
    );
    
    // ... rest of subscription logic ...
  }
}
```

### 4. Add Monitoring Dashboard Component

Create `src/components/MonitoringDashboard.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

export function MonitoringDashboard() {
  const [report, setReport] = useState<any>(null);
  
  useEffect(() => {
    const updateReport = () => {
      const monitor = getQueryMonitor();
      const newReport = monitor.getReport(24);
      setReport(newReport);
    };
    
    updateReport();
    const interval = setInterval(updateReport, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);
  
  if (!report) return <div>Loading...</div>;
  
  return (
    <div className="monitoring-dashboard">
      <h2>Firestore Performance Monitor</h2>
      
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Total Queries</h3>
          <p className="metric-value">{report.queries.total}</p>
          <p className="metric-label">
            {report.queries.cached} cached, {report.queries.firestore} Firestore
          </p>
        </div>
        
        <div className="metric-card">
          <h3>Cache Hit Rate</h3>
          <p className="metric-value">
            {(report.cache.hitRate * 100).toFixed(1)}%
          </p>
        </div>
        
        <div className="metric-card">
          <h3>Avg Execution Time</h3>
          <p className="metric-value">
            {report.performance.averageExecutionTime.toFixed(0)}ms
          </p>
          <p className="metric-label">
            P95: {report.performance.p95.toFixed(0)}ms
          </p>
        </div>
        
        <div className="metric-card">
          <h3>Daily Cost</h3>
          <p className="metric-value">
            ${report.cost.estimatedDaily.toFixed(4)}
          </p>
          <p className="metric-label">
            Savings: {report.cost.savingsPercent.toFixed(1)}%
          </p>
        </div>
      </div>
      
      {report.slowQueries.length > 0 && (
        <div className="slow-queries">
          <h3>Slow Queries</h3>
          <ul>
            {report.slowQueries.map((q: any, i: number) => (
              <li key={i}>
                {q.collection}: {q.executionTime}ms ({q.documentReads} reads)
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="top-collections">
        <h3>Top Collections by Reads</h3>
        <ul>
          {report.topCollections.map((c: any, i: number) => (
            <li key={i}>
              {c.collection}: {c.reads.toLocaleString()} reads (${c.cost.toFixed(6)})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

### 5. Add Daily Report Generation

Create a scheduled task to generate daily reports:

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

export function setupDailyReporting() {
  const monitor = getQueryMonitor();
  
  // Generate report at midnight
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    generateAndSendDailyReport();
    
    // Schedule daily reports
    setInterval(() => {
      generateAndSendDailyReport();
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

function generateAndSendDailyReport() {
  const monitor = getQueryMonitor();
  const report = monitor.getReport(24);
  
  console.log('=== Daily Firestore Report ===');
  console.log(`Total Queries: ${report.queries.total}`);
  console.log(`Cache Hit Rate: ${(report.cache.hitRate * 100).toFixed(1)}%`);
  console.log(`Daily Cost: $${report.cost.estimatedDaily.toFixed(4)}`);
  console.log(`Savings: ${report.cost.savingsPercent.toFixed(1)}%`);
  
  // TODO: Send to analytics service, Slack, email, etc.
}
```

## Integration Checklist

- [ ] Initialize QueryMonitor in app startup
- [ ] Integrate with QueryOptimizer.executeQuery()
- [ ] Integrate with ListenerManager.subscribe()
- [ ] Add monitoring dashboard component
- [ ] Set up daily report generation
- [ ] Configure alert handlers
- [ ] Test monitoring in development
- [ ] Deploy to production
- [ ] Monitor for 24 hours
- [ ] Review first daily report

## Testing Integration

### Test 1: Verify Query Logging

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

// Execute some queries
await fetchPosts();
await fetchMessages();
await fetchProfiles();

// Check metrics
const monitor = getQueryMonitor();
const metrics = monitor.getAllMetrics();
console.log('Logged queries:', metrics.length);
console.log('Daily reads:', monitor.getDailyReads());
```

### Test 2: Verify Alert System

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

const monitor = getQueryMonitor({
  dailyQuota: 100, // Low quota for testing
  alertThreshold: 0.8,
  onAlert: (alert) => {
    console.log('Alert triggered:', alert);
  },
});

// Trigger alert by exceeding quota
monitor.trackDocumentReads(85); // Should trigger warning
```

### Test 3: Verify Report Generation

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

// Log some test queries
const monitor = getQueryMonitor();
for (let i = 0; i < 10; i++) {
  monitor.logQuery({
    queryId: `test-${i}`,
    collection: 'test',
    executionTime: 100 + i * 10,
    documentReads: 10,
    fromCache: i % 2 === 0,
    timestamp: Date.now(),
  });
}

// Generate report
const report = monitor.getReport(24);
console.log('Report:', report);
```

## Monitoring Best Practices

1. **Log All Queries**: Ensure every Firestore query is logged
2. **Set Realistic Quotas**: Configure dailyQuota based on your plan
3. **Monitor Regularly**: Check reports daily to identify issues
4. **Act on Alerts**: Respond to high usage alerts promptly
5. **Track Trends**: Compare reports over time to measure improvements
6. **Optimize Slow Queries**: Use slow query reports to identify bottlenecks
7. **Measure Cache Effectiveness**: Track cache hit rates to validate optimizations

## Troubleshooting

### Issue: Metrics Not Being Logged

**Solution**: Ensure QueryMonitor is initialized before any queries execute:

```typescript
// In main.tsx or App.tsx
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

// Initialize immediately
getQueryMonitor();
```

### Issue: Inaccurate Cost Estimates

**Solution**: Set the correct baseline reads:

```typescript
const monitor = getQueryMonitor();
monitor.setBaselineReads(actualBaselineReads);
```

### Issue: Missing Alerts

**Solution**: Check alert threshold and quota settings:

```typescript
const monitor = getQueryMonitor();
monitor.setDailyQuota(50000);
monitor.setAlertThreshold(0.8);
```

## Next Steps

1. Deploy QueryMonitor to production
2. Monitor for 24 hours to establish baseline
3. Review first daily report
4. Identify optimization opportunities
5. Implement optimizations
6. Measure impact with QueryMonitor
7. Iterate and improve

## Related Documentation

- [QueryMonitor README](./src/utils/firestoreQueryMonitor.README.md)
- [QueryMonitor Examples](./src/utils/firestoreQueryMonitor.example.ts)
- [Task 10 Summary](./TASK_10_SUMMARY.md)
