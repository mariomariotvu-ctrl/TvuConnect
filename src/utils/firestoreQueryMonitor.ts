import { logger } from './logger';
/**
 * Firestore Query Monitor
 * 
 * Monitors and tracks Firestore query performance, document reads, and costs.
 * Provides performance reporting and alerts for high usage.
 * 
 * Features:
 * - Query execution time tracking
 * - Document read counting
 * - Cache hit rate monitoring
 * - Slow query detection
 * - Cost estimation and alerts
 * - Performance reporting
 * 
 * @module firestoreQueryMonitor
 */

export interface QueryMetrics {
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

export interface PerformanceReport {
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

export interface CostAlert {
  type: 'warning' | 'critical';
  message: string;
  currentReads: number;
  quotaLimit: number;
  percentageUsed: number;
  timestamp: number;
}

/**
 * QueryMonitor class for tracking Firestore query performance and costs
 */
export class QueryMonitor {
  private metrics: QueryMetrics[] = [];
  private dailyReads: number = 0;
  private dailyQuota: number = 50000; // Default quota
  private baselineReads: number = 50000; // Baseline before optimization
  private costPerRead: number = 0.00000036; // Firestore pricing: $0.36 per million reads
  private alertThreshold: number = 0.8; // Alert at 80% of quota
  private slowQueryThreshold: number = 2000; // 2 seconds
  private onAlert?: (alert: CostAlert) => void;

  constructor(config?: {
    dailyQuota?: number;
    baselineReads?: number;
    alertThreshold?: number;
    slowQueryThreshold?: number;
    onAlert?: (alert: CostAlert) => void;
  }) {
    if (config) {
      if (config.dailyQuota !== undefined) this.dailyQuota = config.dailyQuota;
      if (config.baselineReads !== undefined) this.baselineReads = config.baselineReads;
      if (config.alertThreshold !== undefined) this.alertThreshold = config.alertThreshold;
      if (config.slowQueryThreshold !== undefined) this.slowQueryThreshold = config.slowQueryThreshold;
      if (config.onAlert) this.onAlert = config.onAlert;
    }

    // Reset daily reads at midnight
    this.scheduleResetAtMidnight();
  }

  /**
   * Log a query execution with metrics
   * Requirement 10.1: Track executionTime, documentReads, fromCache
   */
  logQuery(metrics: QueryMetrics): void {
    // Store metrics with timestamp
    const metricWithTimestamp: QueryMetrics = {
      ...metrics,
      timestamp: metrics.timestamp || Date.now(),
    };

    this.metrics.push(metricWithTimestamp);

    // Track document reads
    if (!metrics.fromCache) {
      this.trackDocumentReads(metrics.documentReads);
    }

    // Check for slow queries
    if (metrics.executionTime > this.slowQueryThreshold) {
      logger.warn(
        `[QueryMonitor] Slow query detected: ${metrics.collection} took ${metrics.executionTime}ms`,
        metrics
      );
    }

    // Limit metrics array size to prevent memory issues (keep last 1000)
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Track document reads and check for quota alerts
   * Requirement 14.1, 14.6: Track total reads and alert at 80% quota
   */
  trackDocumentReads(count: number): void {
    this.dailyReads += count;
    this.alertOnHighUsage();
  }

  /**
   * Alert when daily reads exceed threshold
   * Requirement 14.6: Alert when daily reads exceed 80% of quota
   */
  alertOnHighUsage(): void {
    const percentageUsed = this.dailyReads / this.dailyQuota;

    if (percentageUsed >= this.alertThreshold) {
      const alert: CostAlert = {
        type: percentageUsed >= 0.95 ? 'critical' : 'warning',
        message: `Firestore quota usage at ${(percentageUsed * 100).toFixed(1)}%`,
        currentReads: this.dailyReads,
        quotaLimit: this.dailyQuota,
        percentageUsed: percentageUsed * 100,
        timestamp: Date.now(),
      };

      logger.warn('[QueryMonitor] High usage alert:', alert);

      if (this.onAlert) {
        this.onAlert(alert);
      }
    }
  }

  /**
   * Generate comprehensive performance report
   * Requirement 10.2, 10.4, 10.5, 10.6: Calculate metrics and generate report
   */
  getReport(periodHours: number = 24): PerformanceReport {
    const now = Date.now();
    const periodStart = now - periodHours * 60 * 60 * 1000;

    // Filter metrics within period
    const periodMetrics = this.metrics.filter(m => m.timestamp >= periodStart);

    // Calculate query counts
    const totalQueries = periodMetrics.length;
    const cachedQueries = periodMetrics.filter(m => m.fromCache).length;
    const firestoreQueries = totalQueries - cachedQueries;

    // Calculate read counts
    const totalReads = periodMetrics.reduce((sum, m) => sum + m.documentReads, 0);
    const cachedReads = periodMetrics
      .filter(m => m.fromCache)
      .reduce((sum, m) => sum + m.documentReads, 0);
    const firestoreReads = totalReads - cachedReads;

    // Calculate execution times
    const executionTimes = periodMetrics.map(m => m.executionTime).sort((a, b) => a - b);
    const averageExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((sum, t) => sum + t, 0) / executionTimes.length
        : 0;

    // Calculate percentiles
    const p50 = this.calculatePercentile(executionTimes, 0.5);
    const p95 = this.calculatePercentile(executionTimes, 0.95);
    const p99 = this.calculatePercentile(executionTimes, 0.99);

    // Calculate cache hit rate
    const cacheHitRate = totalQueries > 0 ? cachedQueries / totalQueries : 0;

    // Calculate costs
    const estimatedDaily = this.getCostEstimate();
    const estimatedMonthly = estimatedDaily * 30;
    const baselineDailyCost = this.baselineReads * this.costPerRead;
    const savingsPercent =
      baselineDailyCost > 0 ? ((baselineDailyCost - estimatedDaily) / baselineDailyCost) * 100 : 0;

    // Get slow queries
    const slowQueries = this.getSlowQueries(this.slowQueryThreshold);

    // Calculate top collections by reads
    const collectionStats = new Map<string, { reads: number; cost: number }>();
    periodMetrics.forEach(m => {
      if (!m.fromCache) {
        const stats = collectionStats.get(m.collection) || { reads: 0, cost: 0 };
        stats.reads += m.documentReads;
        stats.cost += m.documentReads * this.costPerRead;
        collectionStats.set(m.collection, stats);
      }
    });

    const topCollections = Array.from(collectionStats.entries())
      .map(([collection, stats]) => ({ collection, ...stats }))
      .sort((a, b) => b.reads - a.reads)
      .slice(0, 10);

    return {
      period: {
        start: periodStart,
        end: now,
      },
      queries: {
        total: totalQueries,
        cached: cachedQueries,
        firestore: firestoreQueries,
      },
      reads: {
        total: totalReads,
        cached: cachedReads,
        firestore: firestoreReads,
      },
      performance: {
        averageExecutionTime,
        p50,
        p95,
        p99,
      },
      cache: {
        hitRate: cacheHitRate,
      },
      cost: {
        estimatedDaily,
        estimatedMonthly,
        savingsPercent,
      },
      slowQueries,
      topCollections,
    };
  }

  /**
   * Get queries that exceed the slow query threshold
   * Requirement 10.2: Identify slow queries (>2s)
   */
  getSlowQueries(threshold: number = this.slowQueryThreshold): QueryMetrics[] {
    return this.metrics
      .filter(m => m.executionTime > threshold)
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, 10); // Return top 10 slowest
  }

  /**
   * Calculate estimated daily cost based on current reads
   * Requirement 14.2: Calculate estimated daily cost
   */
  getCostEstimate(): number {
    return this.dailyReads * this.costPerRead;
  }

  /**
   * Get current daily reads count
   */
  getDailyReads(): number {
    return this.dailyReads;
  }

  /**
   * Get cost savings compared to baseline
   * Requirement 14.3: Compare with baseline before optimization
   */
  getCostSavings(): {
    baselineCost: number;
    currentCost: number;
    savings: number;
    savingsPercent: number;
  } {
    const baselineCost = this.baselineReads * this.costPerRead;
    const currentCost = this.getCostEstimate();
    const savings = baselineCost - currentCost;
    const savingsPercent = baselineCost > 0 ? (savings / baselineCost) * 100 : 0;

    return {
      baselineCost,
      currentCost,
      savings,
      savingsPercent,
    };
  }

  /**
   * Reset daily reads counter (called at midnight)
   */
  resetDailyReads(): void {
    logger.log(
      `[QueryMonitor] Resetting daily reads. Previous: ${this.dailyReads}, Cost: $${this.getCostEstimate().toFixed(4)}`
    );
    this.dailyReads = 0;
  }

  /**
   * Schedule automatic reset at midnight
   */
  private scheduleResetAtMidnight(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      this.resetDailyReads();
      // Schedule next reset
      setInterval(() => this.resetDailyReads(), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get all metrics (useful for debugging)
   */
  getAllMetrics(): QueryMetrics[] {
    return [...this.metrics];
  }

  /**
   * Update baseline reads for comparison
   */
  setBaselineReads(reads: number): void {
    this.baselineReads = reads;
  }

  /**
   * Update daily quota limit
   */
  setDailyQuota(quota: number): void {
    this.dailyQuota = quota;
  }
}

// Singleton instance for global usage
let globalMonitor: QueryMonitor | null = null;

/**
 * Get or create global QueryMonitor instance
 */
export function getQueryMonitor(config?: ConstructorParameters<typeof QueryMonitor>[0]): QueryMonitor {
  if (!globalMonitor) {
    globalMonitor = new QueryMonitor(config);
  }
  return globalMonitor;
}

/**
 * Reset global QueryMonitor instance (useful for testing)
 */
export function resetQueryMonitor(): void {
  globalMonitor = null;
}
