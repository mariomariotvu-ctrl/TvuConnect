# Firestore Query Monitor

A comprehensive monitoring system for tracking Firestore query performance, document reads, and costs in TVU Connect.

## Overview

The QueryMonitor tracks all Firestore query executions, measures performance metrics, calculates costs, and provides alerts when usage exceeds thresholds. It's designed to help optimize Firestore usage and reduce operational costs.

## Features

- **Query Execution Tracking**: Log execution time, document reads, and cache hits for every query
- **Performance Monitoring**: Calculate average execution times, percentiles (p50, p95, p99), and identify slow queries
- **Cost Tracking**: Estimate daily and monthly Firestore costs based on document reads
- **Usage Alerts**: Automatic alerts when daily reads exceed 80% of quota
- **Cache Analytics**: Track cache hit rates to measure optimization effectiveness
- **Performance Reports**: Generate comprehensive reports with all metrics
- **Automatic Reset**: Daily reads counter resets automatically at midnight

## Installation

```typescript
import { QueryMonitor, getQueryMonitor } from '@/utils/firestoreQueryMonitor';
```

## Basic Usage

### Using the Global Singleton

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

// Get global monitor instance
const monitor = getQueryMonitor({
  dailyQuota: 50000,
  baselineReads: 50000,
  alertThreshold: 0.8,
  slowQueryThreshold: 2000,
  onAlert: (alert) => {
    console.error('Firestore usage alert:', alert);
    // Send notification, log to analytics, etc.
  },
});

// Log a query
monitor.logQuery({
  queryId: 'posts-feed-1',
  collection: 'posts',
  executionTime: 150,
  documentReads: 10,
  fromCache: false,
  timestamp: Date.now(),
});

// Get performance report
const report = monitor.getReport(24); // Last 24 hours
console.log('Cache hit rate:', report.cache.hitRate);
console.log('Average execution time:', report.performance.averageExecutionTime);
console.log('Estimated daily cost:', report.cost.estimatedDaily);
```

### Creating a Custom Instance

```typescript
import { QueryMonitor } from '@/utils/firestoreQueryMonitor';

const monitor = new QueryMonitor({
  dailyQuota: 100000,
  baselineReads: 80000,
  alertThreshold: 0.9, // Alert at 90%
  slowQueryThreshold: 3000, // 3 seconds
  onAlert: (alert) => {
    if (alert.type === 'critical') {
      // Send urgent notification
      sendSlackAlert(alert);
    }
  },
});
```

## Integration with Query Optimizer

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';
import { QueryOptimizer } from '@/utils/firestoreQueryOptimizer';

const monitor = getQueryMonitor();
const optimizer = new QueryOptimizer();

async function fetchPosts() {
  const startTime = Date.now();
  
  const result = await optimizer.executeQuery({
    collection: 'posts',
    limit: 10,
    orderBy: { field: 'createdAt', direction: 'desc' },
    useCache: true,
    cacheTTL: 60000,
  });
  
  const executionTime = Date.now() - startTime;
  
  // Log query metrics
  monitor.logQuery({
    queryId: `posts-${Date.now()}`,
    collection: 'posts',
    executionTime,
    documentReads: result.data.length,
    fromCache: result.fromCache,
    timestamp: Date.now(),
  });
  
  return result;
}
```

## API Reference

### Constructor Options

```typescript
interface QueryMonitorConfig {
  dailyQuota?: number;          // Default: 50000
  baselineReads?: number;       // Default: 50000
  alertThreshold?: number;      // Default: 0.8 (80%)
  slowQueryThreshold?: number;  // Default: 2000ms
  onAlert?: (alert: CostAlert) => void;
}
```

### Methods

#### `logQuery(metrics: QueryMetrics): void`

Log a query execution with metrics.

```typescript
monitor.logQuery({
  queryId: 'unique-id',
  collection: 'posts',
  executionTime: 150,
  documentReads: 10,
  fromCache: false,
  timestamp: Date.now(),
  operation: 'read',
  userId: 'user-123',
  filters: ['gender=male', 'academicYear=2024'],
  limit: 10,
});
```

#### `getReport(periodHours?: number): PerformanceReport`

Generate a comprehensive performance report for the specified period (default: 24 hours).

```typescript
const report = monitor.getReport(24);

console.log('Total queries:', report.queries.total);
console.log('Cache hit rate:', report.cache.hitRate);
console.log('Average execution time:', report.performance.averageExecutionTime);
console.log('Estimated daily cost:', report.cost.estimatedDaily);
console.log('Savings vs baseline:', report.cost.savingsPercent);
console.log('Slow queries:', report.slowQueries);
console.log('Top collections:', report.topCollections);
```

#### `getSlowQueries(threshold?: number): QueryMetrics[]`

Get queries that exceed the slow query threshold.

```typescript
const slowQueries = monitor.getSlowQueries(2000);
slowQueries.forEach(query => {
  console.log(`Slow query: ${query.collection} took ${query.executionTime}ms`);
});
```

#### `getCostEstimate(): number`

Get estimated daily cost based on current reads.

```typescript
const dailyCost = monitor.getCostEstimate();
console.log(`Estimated daily cost: $${dailyCost.toFixed(4)}`);
```

#### `getCostSavings(): object`

Get cost savings compared to baseline.

```typescript
const savings = monitor.getCostSavings();
console.log(`Baseline cost: $${savings.baselineCost.toFixed(4)}`);
console.log(`Current cost: $${savings.currentCost.toFixed(4)}`);
console.log(`Savings: $${savings.savings.toFixed(4)} (${savings.savingsPercent.toFixed(1)}%)`);
```

#### `trackDocumentReads(count: number): void`

Manually track document reads (usually called automatically by logQuery).

```typescript
monitor.trackDocumentReads(30);
```

#### `getDailyReads(): number`

Get current daily reads count.

```typescript
const reads = monitor.getDailyReads();
console.log(`Daily reads: ${reads}`);
```

#### `resetDailyReads(): void`

Reset daily reads counter (automatically called at midnight).

```typescript
monitor.resetDailyReads();
```

#### `setBaselineReads(reads: number): void`

Update baseline reads for comparison.

```typescript
monitor.setBaselineReads(80000);
```

#### `setDailyQuota(quota: number): void`

Update daily quota limit.

```typescript
monitor.setDailyQuota(100000);
```

## Data Types

### QueryMetrics

```typescript
interface QueryMetrics {
  queryId: string;
  collection: string;
  executionTime: number;
  documentReads: number;
  fromCache: boolean;
  timestamp: number;
  operation?: 'read' | 'write' | 'listen';
  userId?: string;
  filters?: string[];
  limit?: number;
}
```

### PerformanceReport

```typescript
interface PerformanceReport {
  period: {
    start: number;
    end: number;
  };
  queries: {
    total: number;
    cached: number;
    firestore: number;
  };
  reads: {
    total: number;
    cached: number;
    firestore: number;
  };
  performance: {
    averageExecutionTime: number;
    p50: number;
    p95: number;
    p99: number;
  };
  cache: {
    hitRate: number;
  };
  cost: {
    estimatedDaily: number;
    estimatedMonthly: number;
    savingsPercent: number;
  };
  slowQueries: QueryMetrics[];
  topCollections: Array<{
    collection: string;
    reads: number;
    cost: number;
  }>;
}
```

### CostAlert

```typescript
interface CostAlert {
  type: 'warning' | 'critical';
  message: string;
  currentReads: number;
  quotaLimit: number;
  percentageUsed: number;
  timestamp: number;
}
```

## Usage Examples

### Example 1: Basic Monitoring

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

const monitor = getQueryMonitor();

// Log queries throughout your app
function logQueryExecution(collection: string, executionTime: number, reads: number, cached: boolean) {
  monitor.logQuery({
    queryId: `${collection}-${Date.now()}`,
    collection,
    executionTime,
    documentReads: reads,
    fromCache: cached,
    timestamp: Date.now(),
  });
}

// Get daily report
function getDailyReport() {
  const report = monitor.getReport(24);
  
  console.log('=== Daily Performance Report ===');
  console.log(`Total Queries: ${report.queries.total}`);
  console.log(`Cache Hit Rate: ${(report.cache.hitRate * 100).toFixed(1)}%`);
  console.log(`Avg Execution Time: ${report.performance.averageExecutionTime.toFixed(0)}ms`);
  console.log(`Daily Cost: $${report.cost.estimatedDaily.toFixed(4)}`);
  console.log(`Savings: ${report.cost.savingsPercent.toFixed(1)}%`);
  
  if (report.slowQueries.length > 0) {
    console.log('\nSlow Queries:');
    report.slowQueries.forEach(q => {
      console.log(`  - ${q.collection}: ${q.executionTime}ms`);
    });
  }
}
```

### Example 2: Alert Handling

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

const monitor = getQueryMonitor({
  dailyQuota: 50000,
  alertThreshold: 0.8,
  onAlert: (alert) => {
    if (alert.type === 'critical') {
      // Send urgent notification
      sendSlackMessage({
        channel: '#alerts',
        text: `🚨 CRITICAL: Firestore usage at ${alert.percentageUsed.toFixed(1)}%`,
        color: 'danger',
      });
    } else {
      // Log warning
      console.warn('Firestore usage warning:', alert);
    }
  },
});
```

### Example 3: Performance Dashboard

```typescript
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

function generatePerformanceDashboard() {
  const monitor = getQueryMonitor();
  const report = monitor.getReport(24);
  
  return {
    summary: {
      totalQueries: report.queries.total,
      cacheHitRate: `${(report.cache.hitRate * 100).toFixed(1)}%`,
      avgExecutionTime: `${report.performance.averageExecutionTime.toFixed(0)}ms`,
      p95ExecutionTime: `${report.performance.p95.toFixed(0)}ms`,
    },
    costs: {
      daily: `$${report.cost.estimatedDaily.toFixed(4)}`,
      monthly: `$${report.cost.estimatedMonthly.toFixed(2)}`,
      savings: `${report.cost.savingsPercent.toFixed(1)}%`,
    },
    topCollections: report.topCollections.map(c => ({
      name: c.collection,
      reads: c.reads,
      cost: `$${c.cost.toFixed(6)}`,
    })),
    slowQueries: report.slowQueries.map(q => ({
      collection: q.collection,
      time: `${q.executionTime}ms`,
      reads: q.documentReads,
    })),
  };
}
```

### Example 4: Integration with Custom Hooks

```typescript
import { useEffect } from 'react';
import { getQueryMonitor } from '@/utils/firestoreQueryMonitor';

function usePosts() {
  const monitor = getQueryMonitor();
  
  useEffect(() => {
    const startTime = Date.now();
    
    const fetchPosts = async () => {
      const posts = await getPostsFromFirestore();
      
      monitor.logQuery({
        queryId: `posts-${Date.now()}`,
        collection: 'posts',
        executionTime: Date.now() - startTime,
        documentReads: posts.length,
        fromCache: false,
        timestamp: Date.now(),
      });
      
      return posts;
    };
    
    fetchPosts();
  }, []);
}
```

## Best Practices

1. **Use the Global Singleton**: Use `getQueryMonitor()` for consistent tracking across your app
2. **Log All Queries**: Log every Firestore query to get accurate metrics
3. **Include Context**: Add userId, filters, and operation type for better debugging
4. **Monitor Regularly**: Check reports daily to identify optimization opportunities
5. **Set Appropriate Thresholds**: Adjust alertThreshold and slowQueryThreshold based on your needs
6. **Handle Alerts**: Implement onAlert callback to respond to high usage
7. **Track Savings**: Use setBaselineReads() to measure optimization impact

## Performance Considerations

- **Memory Usage**: Metrics are limited to 1000 entries to prevent memory issues
- **Automatic Cleanup**: Daily reads reset automatically at midnight
- **Efficient Calculations**: Percentiles and aggregations are optimized for performance
- **No External Dependencies**: Uses only in-memory storage (Map)

## Troubleshooting

### High Memory Usage

If you're logging many queries, the metrics array is automatically limited to 1000 entries. You can also manually clear metrics:

```typescript
monitor.clearMetrics();
```

### Inaccurate Cost Estimates

Make sure you're logging all queries and setting the correct baseline:

```typescript
monitor.setBaselineReads(actualBaselineReads);
```

### Missing Alerts

Check that your alert threshold is set correctly:

```typescript
monitor.setDailyQuota(50000);
monitor.alertThreshold = 0.8; // Alert at 80%
```

## Related Modules

- **firestoreCacheManager**: Manages query result caching
- **firestoreQueryOptimizer**: Optimizes query structure and execution
- **firestoreListenerManager**: Manages real-time listeners
- **firestoreBatchProcessor**: Batches write operations

## Requirements Satisfied

This module satisfies the following requirements from the Firestore Query Optimization spec:

- **Requirement 10.1**: Log query execution time for all Firestore queries
- **Requirement 10.2**: Warn when query takes longer than 2 seconds
- **Requirement 10.3**: Track total document reads per session
- **Requirement 10.4**: Provide query performance report with average execution time
- **Requirement 10.5**: Track cache hit rate for each collection
- **Requirement 10.6**: Provide dashboard showing top 10 slowest queries
- **Requirement 14.1**: Track total document reads per day
- **Requirement 14.2**: Calculate estimated daily cost based on Firestore pricing
- **Requirement 14.3**: Compare current cost with baseline before optimization
- **Requirement 14.6**: Alert when daily read quota exceeds 80% of limit

## License

Part of TVU Connect platform.
