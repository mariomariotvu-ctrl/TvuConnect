/**
 * Performance Monitor Utility
 *
 * Tracks key performance metrics for the TVU Connect platform.
 * Sends alerts when metrics exceed defined thresholds.
 *
 * Task 12.1: Create PerformanceMonitor utility
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.8
 */

import { logger } from './logger';

export interface PerformanceMetrics {
  initialLoad?: number;    // ms – time from navigation start to interactive
  fps?: number;            // frames per second
  memory?: number;         // MB – used JS heap
  firestoreReads?: number; // reads per day
  cacheHitRate?: number;   // 0.0 – 1.0
  chatLatency?: number;    // ms – message send latency
  bundleSize?: number;     // KB
}

export interface PerformanceThresholds {
  initialLoad: number;    // warn if > this (ms)
  fps: number;            // warn if < this
  memory: number;         // warn if > this (MB)
  firestoreReads: number; // warn if > this per day
  cacheHitRate: number;   // warn if < this (0-1)
  chatLatency: number;    // warn if > this (ms)
  bundleSize: number;     // warn if > this (KB)
}

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  initialLoad: 1500,       // 1.5s
  fps: 54,                 // ~55 fps target
  memory: 95,              // 95 MB
  firestoreReads: 300,     // 300 reads / day
  cacheHitRate: 0.6,       // 60%
  chatLatency: 200,        // 200 ms
  bundleSize: 320,         // 320 KB
};

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {};
  private thresholds: PerformanceThresholds;
  private periodicCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(thresholds: Partial<PerformanceThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  // ─── Metric Setters ────────────────────────────────────────────────────────

  setInitialLoad(ms: number): void {
    this.metrics.initialLoad = ms;
    this.checkThresholds({ initialLoad: ms });
  }

  setFps(fps: number): void {
    this.metrics.fps = fps;
    this.checkThresholds({ fps });
  }

  setMemory(mb: number): void {
    this.metrics.memory = mb;
    this.checkThresholds({ memory: mb });
  }

  setFirestoreReads(readsPerDay: number): void {
    this.metrics.firestoreReads = readsPerDay;
    this.checkThresholds({ firestoreReads: readsPerDay });
  }

  setCacheHitRate(rate: number): void {
    this.metrics.cacheHitRate = rate;
    this.checkThresholds({ cacheHitRate: rate });
  }

  setChatLatency(ms: number): void {
    this.metrics.chatLatency = ms;
    this.checkThresholds({ chatLatency: ms });
  }

  setBundleSize(kb: number): void {
    this.metrics.bundleSize = kb;
    this.checkThresholds({ bundleSize: kb });
  }

  // ─── Getters ────────────────────────────────────────────────────────────────

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }

  // ─── Threshold Checking ─────────────────────────────────────────────────────

  /**
   * Check supplied metrics against thresholds and send alerts if needed.
   * Requirements: 10.1–10.6, 10.8
   */
  checkThresholds(partial: Partial<PerformanceMetrics> = this.metrics): void {
    if (partial.initialLoad !== undefined && partial.initialLoad > this.thresholds.initialLoad) {
      this.sendAlert(
        `Initial load time cao: ${partial.initialLoad}ms (ngưỡng: ${this.thresholds.initialLoad}ms)`
      );
    }

    if (partial.fps !== undefined && partial.fps < this.thresholds.fps) {
      this.sendAlert(
        `FPS thấp: ${partial.fps} (ngưỡng tối thiểu: ${this.thresholds.fps})`
      );
    }

    if (partial.memory !== undefined && partial.memory > this.thresholds.memory) {
      this.sendAlert(
        `Bộ nhớ cao: ${partial.memory}MB (ngưỡng: ${this.thresholds.memory}MB)`
      );
    }

    if (
      partial.firestoreReads !== undefined &&
      partial.firestoreReads > this.thresholds.firestoreReads
    ) {
      this.sendAlert(
        `Firestore reads cao: ${partial.firestoreReads}/ngày (ngưỡng: ${this.thresholds.firestoreReads}/ngày)`
      );
    }

    if (
      partial.cacheHitRate !== undefined &&
      partial.cacheHitRate < this.thresholds.cacheHitRate
    ) {
      this.sendAlert(
        `Cache hit rate thấp: ${(partial.cacheHitRate * 100).toFixed(1)}% ` +
          `(ngưỡng: ${this.thresholds.cacheHitRate * 100}%)`
      );
    }

    if (partial.chatLatency !== undefined && partial.chatLatency > this.thresholds.chatLatency) {
      this.sendAlert(
        `Chat latency cao: ${partial.chatLatency}ms (ngưỡng: ${this.thresholds.chatLatency}ms)`
      );
    }

    if (partial.bundleSize !== undefined && partial.bundleSize > this.thresholds.bundleSize) {
      this.sendAlert(
        `Bundle size lớn: ${partial.bundleSize}KB (ngưỡng: ${this.thresholds.bundleSize}KB)`
      );
    }
  }

  /**
   * Send an alert (currently logs a warning; can be extended to remote reporting).
   * Requirements: 10.8
   */
  sendAlert(message: string): void {
    logger.warn(`[PerformanceMonitor] ⚠️ ${message}`);
  }

  // ─── Periodic Monitoring ─────────────────────────────────────────────────────

  /**
   * Start periodic metric checks every `intervalMs` milliseconds.
   * Default interval: 60 seconds.
   * Returns a cleanup function to stop monitoring.
   */
  startPeriodicChecks(intervalMs = 60_000): () => void {
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
    }

    this.periodicCheckInterval = setInterval(() => {
      // Capture current memory if available
      const mem = (performance as any).memory;
      if (mem) {
        const usedMB = mem.usedJSHeapSize / (1024 * 1024);
        this.setMemory(parseFloat(usedMB.toFixed(1)));
      }

      this.checkThresholds();
      logger.log('[PerformanceMonitor] Kiểm tra định kỳ', this.metrics);
    }, intervalMs);

    logger.log(`[PerformanceMonitor] Bắt đầu kiểm tra định kỳ (mỗi ${intervalMs / 1000}s)`);

    return () => {
      if (this.periodicCheckInterval) {
        clearInterval(this.periodicCheckInterval);
        this.periodicCheckInterval = null;
      }
    };
  }

  stopPeriodicChecks(): void {
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
      this.periodicCheckInterval = null;
    }
  }
}

// Singleton instance for use across the app
export const performanceMonitor = new PerformanceMonitor();

// Export class for testing / custom instances
export { PerformanceMonitor };
