/**
 * Cache Hit Rate Monitor
 *
 * Tracks cache hits and misses across the application.
 * Logs warnings when cache hit rate falls below 60%.
 *
 * Task 6.7: Implement cache hit rate monitoring
 * Requirements: 6.8
 */

import { logger } from './logger';

const CACHE_HIT_RATE_WARNING_THRESHOLD = 0.6; // 60%

interface CacheStats {
  hits: number;
  misses: number;
}

class CacheMonitor {
  private stats: Map<string, CacheStats> = new Map();

  /**
   * Record a cache hit for the given key/namespace
   */
  recordHit(namespace: string = 'default'): void {
    const current = this.getOrCreate(namespace);
    current.hits += 1;
    this.stats.set(namespace, current);
    this.checkHitRate(namespace);
  }

  /**
   * Record a cache miss for the given key/namespace
   */
  recordMiss(namespace: string = 'default'): void {
    const current = this.getOrCreate(namespace);
    current.misses += 1;
    this.stats.set(namespace, current);
    this.checkHitRate(namespace);
  }

  /**
   * Calculate cache hit rate: hits / (hits + misses)
   */
  getHitRate(namespace: string = 'default'): number {
    const stats = this.stats.get(namespace);
    if (!stats) return 0;

    const total = stats.hits + stats.misses;
    if (total === 0) return 0;

    return stats.hits / total;
  }

  /**
   * Get raw stats for a namespace
   */
  getStats(namespace: string = 'default'): CacheStats {
    return this.getOrCreate(namespace);
  }

  /**
   * Get all stats
   */
  getAllStats(): Record<string, CacheStats & { hitRate: number }> {
    const result: Record<string, CacheStats & { hitRate: number }> = {};
    for (const [ns, stats] of this.stats) {
      result[ns] = {
        ...stats,
        hitRate: this.getHitRate(ns),
      };
    }
    return result;
  }

  /**
   * Reset stats for a namespace
   */
  reset(namespace: string = 'default'): void {
    this.stats.set(namespace, { hits: 0, misses: 0 });
  }

  /**
   * Reset all stats
   */
  resetAll(): void {
    this.stats.clear();
  }

  /**
   * Check and warn if hit rate < 60%
   */
  private checkHitRate(namespace: string): void {
    const stats = this.stats.get(namespace);
    if (!stats) return;

    const total = stats.hits + stats.misses;
    // Only warn after at least 10 requests to avoid noise
    if (total < 10) return;

    const hitRate = stats.hits / total;
    if (hitRate < CACHE_HIT_RATE_WARNING_THRESHOLD) {
      logger.warn(
        `[CacheMonitor] ⚠️ Tỷ lệ cache hit thấp cho "${namespace}": ` +
          `${(hitRate * 100).toFixed(1)}% (ngưỡng: ${CACHE_HIT_RATE_WARNING_THRESHOLD * 100}%). ` +
          `Hits: ${stats.hits}, Misses: ${stats.misses}`
      );
    }
  }

  private getOrCreate(namespace: string): CacheStats {
    if (!this.stats.has(namespace)) {
      this.stats.set(namespace, { hits: 0, misses: 0 });
    }
    return this.stats.get(namespace)!;
  }
}

// Export singleton
export const cacheMonitor = new CacheMonitor();

// Export class for testing
export { CacheMonitor };
