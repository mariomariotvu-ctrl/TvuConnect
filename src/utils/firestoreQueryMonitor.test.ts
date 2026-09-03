/**
 * Tests for Firestore Query Monitor
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QueryMonitor, getQueryMonitor, resetQueryMonitor, QueryMetrics, CostAlert } from './firestoreQueryMonitor';

describe('QueryMonitor', () => {
  let monitor: QueryMonitor;

  beforeEach(() => {
    monitor = new QueryMonitor({
      dailyQuota: 50000,
      baselineReads: 50000,
      alertThreshold: 0.8,
      slowQueryThreshold: 2000,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('logQuery', () => {
    it('should log query metrics with timestamp', () => {
      const metrics: QueryMetrics = {
        queryId: 'test-1',
        collection: 'posts',
        executionTime: 150,
        documentReads: 10,
        fromCache: false,
        timestamp: Date.now(),
      };

      monitor.logQuery(metrics);

      const allMetrics = monitor.getAllMetrics();
      expect(allMetrics).toHaveLength(1);
      expect(allMetrics[0]).toMatchObject(metrics);
    });

    it('should add timestamp if not provided', () => {
      const metrics: QueryMetrics = {
        queryId: 'test-2',
        collection: 'users',
        executionTime: 100,
        documentReads: 5,
        fromCache: false,
        timestamp: 0,
      };

      const beforeLog = Date.now();
      monitor.logQuery(metrics);
      const afterLog = Date.now();

      const allMetrics = monitor.getAllMetrics();
      expect(allMetrics[0].timestamp).toBeGreaterThanOrEqual(beforeLog);
      expect(allMetrics[0].timestamp).toBeLessThanOrEqual(afterLog);
    });

    it('should track document reads for non-cached queries', () => {
      const metrics: QueryMetrics = {
        queryId: 'test-3',
        collection: 'messages',
        executionTime: 200,
        documentReads: 30,
        fromCache: false,
        timestamp: Date.now(),
      };

      monitor.logQuery(metrics);

      expect(monitor.getDailyReads()).toBe(30);
    });

    it('should not track document reads for cached queries', () => {
      const metrics: QueryMetrics = {
        queryId: 'test-4',
        collection: 'posts',
        executionTime: 50,
        documentReads: 10,
        fromCache: true,
        timestamp: Date.now(),
      };

      monitor.logQuery(metrics);

      expect(monitor.getDailyReads()).toBe(0);
    });

    it('should warn on slow queries', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const metrics: QueryMetrics = {
        queryId: 'test-5',
        collection: 'places',
        executionTime: 3000, // 3 seconds - slow!
        documentReads: 100,
        fromCache: false,
        timestamp: Date.now(),
      };

      monitor.logQuery(metrics);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Slow query detected'),
        expect.any(Object)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should limit metrics array to 1000 entries', () => {
      // Log 1100 queries
      for (let i = 0; i < 1100; i++) {
        monitor.logQuery({
          queryId: `test-${i}`,
          collection: 'test',
          executionTime: 100,
          documentReads: 1,
          fromCache: false,
          timestamp: Date.now(),
        });
      }

      const allMetrics = monitor.getAllMetrics();
      expect(allMetrics).toHaveLength(1000);
      // Should keep the most recent 1000
      expect(allMetrics[0].queryId).toBe('test-100');
      expect(allMetrics[999].queryId).toBe('test-1099');
    });
  });

  describe('trackDocumentReads', () => {
    it('should accumulate document reads', () => {
      monitor.trackDocumentReads(10);
      monitor.trackDocumentReads(20);
      monitor.trackDocumentReads(30);

      expect(monitor.getDailyReads()).toBe(60);
    });

    it('should trigger alert when threshold exceeded', () => {
      const alertCallback = vi.fn();
      const monitorWithAlert = new QueryMonitor({
        dailyQuota: 100,
        alertThreshold: 0.8,
        onAlert: alertCallback,
      });

      monitorWithAlert.trackDocumentReads(85); // 85% of quota

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          currentReads: 85,
          quotaLimit: 100,
        })
      );
    });

    it('should trigger critical alert at 95% quota', () => {
      const alertCallback = vi.fn();
      const monitorWithAlert = new QueryMonitor({
        dailyQuota: 100,
        alertThreshold: 0.8,
        onAlert: alertCallback,
      });

      monitorWithAlert.trackDocumentReads(96); // 96% of quota

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'critical',
          percentageUsed: 96,
        })
      );
    });
  });

  describe('getReport', () => {
    beforeEach(() => {
      // Log various queries for testing
      const now = Date.now();

      // Cached queries
      monitor.logQuery({
        queryId: 'cached-1',
        collection: 'posts',
        executionTime: 50,
        documentReads: 10,
        fromCache: true,
        timestamp: now - 1000,
      });

      monitor.logQuery({
        queryId: 'cached-2',
        collection: 'users',
        executionTime: 30,
        documentReads: 5,
        fromCache: true,
        timestamp: now - 2000,
      });

      // Firestore queries
      monitor.logQuery({
        queryId: 'firestore-1',
        collection: 'messages',
        executionTime: 200,
        documentReads: 30,
        fromCache: false,
        timestamp: now - 3000,
      });

      monitor.logQuery({
        queryId: 'firestore-2',
        collection: 'posts',
        executionTime: 150,
        documentReads: 10,
        fromCache: false,
        timestamp: now - 4000,
      });

      // Slow query
      monitor.logQuery({
        queryId: 'slow-1',
        collection: 'places',
        executionTime: 3000,
        documentReads: 100,
        fromCache: false,
        timestamp: now - 5000,
      });
    });

    it('should calculate total queries correctly', () => {
      const report = monitor.getReport(24);

      expect(report.queries.total).toBe(5);
      expect(report.queries.cached).toBe(2);
      expect(report.queries.firestore).toBe(3);
    });

    it('should calculate total reads correctly', () => {
      const report = monitor.getReport(24);

      expect(report.reads.total).toBe(155); // 10+5+30+10+100
      expect(report.reads.cached).toBe(15); // 10+5
      expect(report.reads.firestore).toBe(140); // 30+10+100
    });

    it('should calculate average execution time', () => {
      const report = monitor.getReport(24);

      // (50+30+200+150+3000) / 5 = 686
      expect(report.performance.averageExecutionTime).toBe(686);
    });

    it('should calculate percentiles correctly', () => {
      const report = monitor.getReport(24);

      // Sorted: [30, 50, 150, 200, 3000]
      expect(report.performance.p50).toBe(150); // Median
      expect(report.performance.p95).toBe(3000); // 95th percentile
      expect(report.performance.p99).toBe(3000); // 99th percentile
    });

    it('should calculate cache hit rate', () => {
      const report = monitor.getReport(24);

      expect(report.cache.hitRate).toBe(0.4); // 2 cached out of 5 total
    });

    it('should calculate cost estimates', () => {
      const report = monitor.getReport(24);

      // 140 Firestore reads * $0.00000036 per read
      expect(report.cost.estimatedDaily).toBeCloseTo(0.0000504, 8);
      expect(report.cost.estimatedMonthly).toBeCloseTo(0.001512, 8);
    });

    it('should calculate savings percent', () => {
      const report = monitor.getReport(24);

      // Baseline: 50000 reads, Current: 140 reads
      // Savings: (50000 - 140) / 50000 * 100 = 99.72%
      expect(report.cost.savingsPercent).toBeGreaterThan(99);
    });

    it('should identify slow queries', () => {
      const report = monitor.getReport(24);

      expect(report.slowQueries).toHaveLength(1);
      expect(report.slowQueries[0].queryId).toBe('slow-1');
      expect(report.slowQueries[0].executionTime).toBe(3000);
    });

    it('should list top collections by reads', () => {
      const report = monitor.getReport(24);

      expect(report.topCollections).toHaveLength(3);
      expect(report.topCollections[0].collection).toBe('places'); // 100 reads
      expect(report.topCollections[0].reads).toBe(100);
      expect(report.topCollections[1].collection).toBe('messages'); // 30 reads
      expect(report.topCollections[2].collection).toBe('posts'); // 10 reads
    });

    it('should filter metrics by time period', () => {
      const now = Date.now();

      // Add old metric outside period
      monitor.logQuery({
        queryId: 'old-1',
        collection: 'old',
        executionTime: 100,
        documentReads: 50,
        fromCache: false,
        timestamp: now - 48 * 60 * 60 * 1000, // 48 hours ago
      });

      const report = monitor.getReport(24); // Last 24 hours only

      // Should not include the old metric
      expect(report.queries.total).toBe(5); // Not 6
    });
  });

  describe('getSlowQueries', () => {
    it('should return queries exceeding threshold', () => {
      monitor.logQuery({
        queryId: 'fast-1',
        collection: 'posts',
        executionTime: 100,
        documentReads: 10,
        fromCache: false,
        timestamp: Date.now(),
      });

      monitor.logQuery({
        queryId: 'slow-1',
        collection: 'messages',
        executionTime: 2500,
        documentReads: 30,
        fromCache: false,
        timestamp: Date.now(),
      });

      monitor.logQuery({
        queryId: 'slow-2',
        collection: 'places',
        executionTime: 3000,
        documentReads: 100,
        fromCache: false,
        timestamp: Date.now(),
      });

      const slowQueries = monitor.getSlowQueries(2000);

      expect(slowQueries).toHaveLength(2);
      expect(slowQueries[0].queryId).toBe('slow-2'); // Slowest first
      expect(slowQueries[1].queryId).toBe('slow-1');
    });

    it('should limit to top 10 slowest queries', () => {
      // Log 15 slow queries
      for (let i = 0; i < 15; i++) {
        monitor.logQuery({
          queryId: `slow-${i}`,
          collection: 'test',
          executionTime: 2100 + i * 100,
          documentReads: 10,
          fromCache: false,
          timestamp: Date.now(),
        });
      }

      const slowQueries = monitor.getSlowQueries(2000);

      expect(slowQueries).toHaveLength(10);
      // Should be sorted by execution time descending
      expect(slowQueries[0].executionTime).toBeGreaterThan(slowQueries[9].executionTime);
    });
  });

  describe('getCostEstimate', () => {
    it('should calculate cost based on daily reads', () => {
      monitor.trackDocumentReads(10000);

      const cost = monitor.getCostEstimate();

      // 10000 * $0.00000036 = $0.0036
      expect(cost).toBeCloseTo(0.0036, 6);
    });

    it('should return 0 for no reads', () => {
      const cost = monitor.getCostEstimate();

      expect(cost).toBe(0);
    });
  });

  describe('getCostSavings', () => {
    it('should calculate savings compared to baseline', () => {
      monitor.trackDocumentReads(25000); // Half of baseline

      const savings = monitor.getCostSavings();

      expect(savings.baselineCost).toBeCloseTo(0.018, 6); // 50000 * 0.00000036
      expect(savings.currentCost).toBeCloseTo(0.009, 6); // 25000 * 0.00000036
      expect(savings.savings).toBeCloseTo(0.009, 6);
      expect(savings.savingsPercent).toBeCloseTo(50, 1);
    });

    it('should handle zero baseline', () => {
      const monitorZeroBaseline = new QueryMonitor({
        baselineReads: 0,
        dailyQuota: 50000,
      });

      monitorZeroBaseline.trackDocumentReads(1000);

      const savings = monitorZeroBaseline.getCostSavings();

      // When baseline is 0, there's no baseline to compare against
      expect(savings.baselineCost).toBe(0);
      expect(savings.currentCost).toBeGreaterThan(0);
      expect(savings.savings).toBeLessThan(0); // Negative savings (current > baseline)
      expect(savings.savingsPercent).toBe(0); // Should return 0 when baseline is 0
    });
  });

  describe('resetDailyReads', () => {
    it('should reset daily reads to zero', () => {
      monitor.trackDocumentReads(1000);
      expect(monitor.getDailyReads()).toBe(1000);

      monitor.resetDailyReads();

      expect(monitor.getDailyReads()).toBe(0);
    });
  });

  describe('clearMetrics', () => {
    it('should clear all stored metrics', () => {
      monitor.logQuery({
        queryId: 'test-1',
        collection: 'posts',
        executionTime: 100,
        documentReads: 10,
        fromCache: false,
        timestamp: Date.now(),
      });

      expect(monitor.getAllMetrics()).toHaveLength(1);

      monitor.clearMetrics();

      expect(monitor.getAllMetrics()).toHaveLength(0);
    });
  });

  describe('setBaselineReads', () => {
    it('should update baseline reads', () => {
      monitor.setBaselineReads(100000);
      monitor.trackDocumentReads(50000);

      const savings = monitor.getCostSavings();

      expect(savings.baselineCost).toBeCloseTo(0.036, 6); // 100000 * 0.00000036
      expect(savings.savingsPercent).toBeCloseTo(50, 1);
    });
  });

  describe('setDailyQuota', () => {
    it('should update daily quota', () => {
      monitor.setDailyQuota(100000);
      monitor.trackDocumentReads(85000);

      // Should not trigger alert at 85% of new quota
      const alertCallback = vi.fn();
      const monitorWithAlert = new QueryMonitor({
        dailyQuota: 100000,
        alertThreshold: 0.8,
        onAlert: alertCallback,
      });

      monitorWithAlert.trackDocumentReads(85000);

      expect(alertCallback).toHaveBeenCalled();
    });
  });

  describe('global singleton', () => {
    afterEach(() => {
      resetQueryMonitor();
    });

    it('should return same instance on multiple calls', () => {
      const monitor1 = getQueryMonitor();
      const monitor2 = getQueryMonitor();

      expect(monitor1).toBe(monitor2);
    });

    it('should create new instance after reset', () => {
      const monitor1 = getQueryMonitor();
      resetQueryMonitor();
      const monitor2 = getQueryMonitor();

      expect(monitor1).not.toBe(monitor2);
    });

    it('should share state across calls', () => {
      const monitor1 = getQueryMonitor();
      monitor1.trackDocumentReads(100);

      const monitor2 = getQueryMonitor();

      expect(monitor2.getDailyReads()).toBe(100);
    });
  });

  describe('alertOnHighUsage', () => {
    it('should not alert below threshold', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      monitor.trackDocumentReads(30000); // 60% of quota

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should alert at threshold', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      monitor.trackDocumentReads(40000); // 80% of quota

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('High usage alert'),
        expect.any(Object)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should call onAlert callback', () => {
      const alertCallback = vi.fn();
      const monitorWithAlert = new QueryMonitor({
        dailyQuota: 50000,
        alertThreshold: 0.8,
        onAlert: alertCallback,
      });

      monitorWithAlert.trackDocumentReads(40000);

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining<CostAlert>({
          type: 'warning',
          message: expect.stringContaining('80.0%'),
          currentReads: 40000,
          quotaLimit: 50000,
          percentageUsed: 80,
          timestamp: expect.any(Number),
        })
      );
    });
  });
});
