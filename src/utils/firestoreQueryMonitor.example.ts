/**
 * Example usage of Firestore Query Monitor
 * 
 * This file demonstrates how to integrate QueryMonitor into your application
 * to track Firestore query performance, costs, and generate reports.
 */

import { getQueryMonitor, QueryMonitor } from './firestoreQueryMonitor';
import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '@/firebase';
import { logger } from '@/utils/logger';

// ============================================================================
// Example 1: Basic Setup with Global Singleton
// ============================================================================

export function setupGlobalMonitor() {
  const monitor = getQueryMonitor({
    dailyQuota: 50000,
    baselineReads: 50000,
    alertThreshold: 0.8,
    slowQueryThreshold: 2000,
    onAlert: (alert) => {
      console.error('🚨 Firestore Usage Alert:', alert);
      
      if (alert.type === 'critical') {
        // Send notification to admin
        sendAdminNotification({
          title: 'Critical Firestore Usage',
          message: `Usage at ${alert.percentageUsed.toFixed(1)}%`,
          priority: 'high',
        });
      }
    },
  });

  return monitor;
}

// ============================================================================
// Example 2: Logging Queries in a Custom Hook
// ============================================================================

export async function fetchPostsWithMonitoring() {
  const monitor = getQueryMonitor();
  const startTime = Date.now();
  
  try {
    // Execute Firestore query
    const postsRef = collection(db, 'posts');
    const q = query(
      postsRef,
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    
    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Log query metrics
    monitor.logQuery({
      queryId: `posts-feed-${Date.now()}`,
      collection: 'posts',
      executionTime: Date.now() - startTime,
      documentReads: snapshot.size,
      fromCache: snapshot.metadata.fromCache,
      timestamp: Date.now(),
      operation: 'read',
      filters: ['orderBy:createdAt:desc'],
      limit: 10,
    });
    
    return posts;
  } catch (error) {
    console.error('Error fetching posts:', error);
    throw error;
  }
}

// ============================================================================
// Example 3: Integration with Query Optimizer
// ============================================================================

export async function fetchPostsWithOptimizer() {
  const monitor = getQueryMonitor();
  const startTime = Date.now();
  
  // Simulate query optimizer execution
  const result = {
    data: [],
    fromCache: false,
    executionTime: 0,
    lastDoc: null,
    hasMore: false,
  };
  
  // Log the optimized query
  monitor.logQuery({
    queryId: `optimized-posts-${Date.now()}`,
    collection: 'posts',
    executionTime: Date.now() - startTime,
    documentReads: result.data.length,
    fromCache: result.fromCache,
    timestamp: Date.now(),
    operation: 'read',
  });
  
  return result;
}

// ============================================================================
// Example 4: Generating Daily Performance Report
// ============================================================================

export function generateDailyReport() {
  const monitor = getQueryMonitor();
  const report = monitor.getReport(24); // Last 24 hours
  
  logger.log('=== Firestore Performance Report (24h) ===\n');
  
  // Query Statistics
  logger.log('📊 Query Statistics:');
  logger.log(`  Total Queries: ${report.queries.total}`);
  logger.log(`  Cached Queries: ${report.queries.cached} (${((report.queries.cached / report.queries.total) * 100).toFixed(1)}%)`);
  logger.log(`  Firestore Queries: ${report.queries.firestore}`);
  logger.log('');
  
  // Read Statistics
  logger.log('📖 Document Reads:');
  logger.log(`  Total Reads: ${report.reads.total.toLocaleString()}`);
  logger.log(`  Cached Reads: ${report.reads.cached.toLocaleString()}`);
  logger.log(`  Firestore Reads: ${report.reads.firestore.toLocaleString()}`);
  logger.log('');
  
  // Performance Metrics
  logger.log('⚡ Performance:');
  logger.log(`  Average Execution Time: ${report.performance.averageExecutionTime.toFixed(0)}ms`);
  logger.log(`  P50 (Median): ${report.performance.p50.toFixed(0)}ms`);
  logger.log(`  P95: ${report.performance.p95.toFixed(0)}ms`);
  logger.log(`  P99: ${report.performance.p99.toFixed(0)}ms`);
  logger.log('');
  
  // Cache Performance
  logger.log('💾 Cache Performance:');
  logger.log(`  Hit Rate: ${(report.cache.hitRate * 100).toFixed(1)}%`);
  logger.log('');
  
  // Cost Analysis
  logger.log('💰 Cost Analysis:');
  logger.log(`  Estimated Daily Cost: $${report.cost.estimatedDaily.toFixed(4)}`);
  logger.log(`  Estimated Monthly Cost: $${report.cost.estimatedMonthly.toFixed(2)}`);
  logger.log(`  Savings vs Baseline: ${report.cost.savingsPercent.toFixed(1)}%`);
  logger.log('');
  
  // Slow Queries
  if (report.slowQueries.length > 0) {
    logger.log('🐌 Slow Queries (>2s):');
    report.slowQueries.forEach((q, i) => {
      logger.log(`  ${i + 1}. ${q.collection}: ${q.executionTime}ms (${q.documentReads} reads)`);
    });
    logger.log('');
  }
  
  // Top Collections
  logger.log('🔝 Top Collections by Reads:');
  report.topCollections.slice(0, 5).forEach((c, i) => {
    logger.log(`  ${i + 1}. ${c.collection}: ${c.reads.toLocaleString()} reads ($${c.cost.toFixed(6)})`);
  });
  logger.log('');
  
  return report;
}

// ============================================================================
// Example 5: Real-time Monitoring Dashboard
// ============================================================================

export function getMonitoringDashboard() {
  const monitor = getQueryMonitor();
  const report = monitor.getReport(24);
  const savings = monitor.getCostSavings();
  const dailyReads = monitor.getDailyReads();
  
  return {
    overview: {
      totalQueries: report.queries.total,
      cacheHitRate: `${(report.cache.hitRate * 100).toFixed(1)}%`,
      avgExecutionTime: `${report.performance.averageExecutionTime.toFixed(0)}ms`,
      dailyReads: dailyReads.toLocaleString(),
    },
    performance: {
      p50: `${report.performance.p50.toFixed(0)}ms`,
      p95: `${report.performance.p95.toFixed(0)}ms`,
      p99: `${report.performance.p99.toFixed(0)}ms`,
      slowQueriesCount: report.slowQueries.length,
    },
    costs: {
      daily: `$${report.cost.estimatedDaily.toFixed(4)}`,
      monthly: `$${report.cost.estimatedMonthly.toFixed(2)}`,
      baseline: `$${savings.baselineCost.toFixed(4)}`,
      savings: `$${savings.savings.toFixed(4)}`,
      savingsPercent: `${savings.savingsPercent.toFixed(1)}%`,
    },
    topCollections: report.topCollections.slice(0, 5).map(c => ({
      name: c.collection,
      reads: c.reads.toLocaleString(),
      cost: `$${c.cost.toFixed(6)}`,
    })),
    alerts: {
      quotaUsage: `${((dailyReads / 50000) * 100).toFixed(1)}%`,
      status: dailyReads > 40000 ? 'warning' : 'ok',
    },
  };
}

// ============================================================================
// Example 6: Tracking Listener Performance
// ============================================================================

export function trackListenerPerformance(
  collection: string,
  snapshotSize: number,
  fromCache: boolean
) {
  const monitor = getQueryMonitor();
  
  monitor.logQuery({
    queryId: `listener-${collection}-${Date.now()}`,
    collection,
    executionTime: 0, // Listeners don't have execution time
    documentReads: snapshotSize,
    fromCache,
    timestamp: Date.now(),
    operation: 'listen',
  });
}

// ============================================================================
// Example 7: Custom Alert Handler
// ============================================================================

export function setupCustomAlertHandler() {
  const monitor = new QueryMonitor({
    dailyQuota: 50000,
    alertThreshold: 0.8,
    onAlert: (alert) => {
      // Log to analytics
      logToAnalytics('firestore_usage_alert', {
        type: alert.type,
        percentageUsed: alert.percentageUsed,
        currentReads: alert.currentReads,
      });
      
      // Send to monitoring service
      if (alert.type === 'critical') {
        sendToMonitoringService({
          service: 'firestore',
          severity: 'critical',
          message: alert.message,
          metadata: {
            currentReads: alert.currentReads,
            quotaLimit: alert.quotaLimit,
          },
        });
      }
      
      // Show user notification
      showNotification({
        title: 'Firestore Usage Alert',
        message: alert.message,
        type: alert.type === 'critical' ? 'error' : 'warning',
      });
    },
  });
  
  return monitor;
}

// ============================================================================
// Example 8: Comparing Before/After Optimization
// ============================================================================

export function compareOptimizationImpact() {
  const monitor = getQueryMonitor();
  
  // Set baseline from before optimization
  monitor.setBaselineReads(50000);
  
  // Get current savings
  const savings = monitor.getCostSavings();
  
  logger.log('=== Optimization Impact ===\n');
  logger.log(`Baseline Daily Reads: ${50000}`);
  logger.log(`Current Daily Reads: ${monitor.getDailyReads()}`);
  logger.log(`Reduction: ${50000 - monitor.getDailyReads()} reads`);
  logger.log('');
  logger.log(`Baseline Daily Cost: $${savings.baselineCost.toFixed(4)}`);
  logger.log(`Current Daily Cost: $${savings.currentCost.toFixed(4)}`);
  logger.log(`Savings: $${savings.savings.toFixed(4)} (${savings.savingsPercent.toFixed(1)}%)`);
  logger.log('');
  logger.log(`Monthly Savings: $${(savings.savings * 30).toFixed(2)}`);
  logger.log(`Annual Savings: $${(savings.savings * 365).toFixed(2)}`);
}

// ============================================================================
// Example 9: Exporting Metrics for Analysis
// ============================================================================

export function exportMetricsToJSON() {
  const monitor = getQueryMonitor();
  const report = monitor.getReport(24);
  const allMetrics = monitor.getAllMetrics();
  
  const exportData = {
    timestamp: new Date().toISOString(),
    report,
    metrics: allMetrics,
    summary: {
      totalQueries: report.queries.total,
      cacheHitRate: report.cache.hitRate,
      avgExecutionTime: report.performance.averageExecutionTime,
      dailyCost: report.cost.estimatedDaily,
      savingsPercent: report.cost.savingsPercent,
    },
  };
  
  // Convert to JSON
  const json = JSON.stringify(exportData, null, 2);
  
  // Save to file or send to analytics
  logger.log('Exported metrics:', json);
  
  return exportData;
}

// ============================================================================
// Example 10: Scheduled Reporting
// ============================================================================

export function setupScheduledReporting() {
  const monitor = getQueryMonitor();
  
  // Generate report every hour
  setInterval(() => {
    const report = monitor.getReport(1); // Last hour
    
    logger.log(`[${new Date().toISOString()}] Hourly Report:`);
    logger.log(`  Queries: ${report.queries.total}`);
    logger.log(`  Cache Hit Rate: ${(report.cache.hitRate * 100).toFixed(1)}%`);
    logger.log(`  Avg Time: ${report.performance.averageExecutionTime.toFixed(0)}ms`);
    
    // Send to monitoring service
    sendMetricsToMonitoring({
      timestamp: Date.now(),
      queries: report.queries.total,
      cacheHitRate: report.cache.hitRate,
      avgExecutionTime: report.performance.averageExecutionTime,
    });
  }, 60 * 60 * 1000); // Every hour
  
  // Generate daily report at midnight
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    generateDailyReport();
    
    // Schedule daily reports
    setInterval(() => {
      generateDailyReport();
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

// ============================================================================
// Helper Functions (Mock implementations)
// ============================================================================

function sendAdminNotification(notification: any) {
  logger.log('Sending admin notification:', notification);
}

function logToAnalytics(event: string, data: any) {
  logger.log('Analytics event:', event, data);
}

function sendToMonitoringService(data: any) {
  logger.log('Sending to monitoring service:', data);
}

function showNotification(notification: any) {
  logger.log('Showing notification:', notification);
}

function sendMetricsToMonitoring(metrics: any) {
  logger.log('Sending metrics to monitoring:', metrics);
}
