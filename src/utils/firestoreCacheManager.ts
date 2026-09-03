/**
 * Firestore Cache Manager with TTL and LRU eviction
 * 
 * This cache manager is designed to reduce Firestore document reads by caching
 * query results with configurable TTL (Time-To-Live) and automatic LRU eviction.
 * 
 * Features:
 * - TTL-based expiration for cache entries
 * - LRU (Least Recently Used) eviction when cache is full
 * - Cache statistics tracking (hits, misses, evictions, hit rate)
 * - Pattern-based cache invalidation for bulk invalidation
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7
 */

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;  // Unix timestamp when entry was created
  ttl: number;        // Time-to-live in milliseconds
  hits: number;       // Number of times this entry was accessed
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;       // Current number of entries in cache
  hits: number;       // Total cache hits
  misses: number;     // Total cache misses
  hitRate: number;    // Hit rate percentage (0-100)
  evictions: number;  // Total number of evictions
}

/**
 * Cache Manager configuration
 */
export interface CacheConfig {
  maxSize: number;      // Maximum number of entries per collection
  defaultTTL: number;   // Default TTL in milliseconds
}

/**
 * Firestore Cache Manager
 * 
 * Implements in-memory caching with TTL and LRU eviction policy.
 * Designed to reduce Firestore document reads and improve query performance.
 */
export class FirestoreCacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private config: CacheConfig;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.cache = new Map();
    this.config = {
      maxSize: config.maxSize ?? 100,
      defaultTTL: config.defaultTTL ?? 60000, // 60 seconds default
    };
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Get data from cache
   * Returns null if key doesn't exist or entry has expired
   * 
   * Requirement 8.1: Implement in-memory cache using Map data structure
   * Requirement 8.2: Store cache entries with timestamp and TTL
   * Requirement 8.3: Remove expired entries from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    const age = now - entry.timestamp;
    
    if (age > entry.ttl) {
      // Entry expired, remove it
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Entry is valid, update access tracking
    entry.hits++;
    this.stats.hits++;

    // Move to end (most recently used) for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data as T;
  }

  /**
   * Set data in cache with optional TTL
   * If cache is full, evicts oldest entry using LRU policy
   * 
   * Requirement 8.1: Implement in-memory cache using Map data structure
   * Requirement 8.2: Store cache entries with timestamp and TTL
   * Requirement 8.6: Limit cache size to maximum entries per collection
   * Requirement 8.7: Evict oldest entries using LRU algorithm when cache is full
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // If key already exists, remove it first (will be re-added at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.config.maxSize) {
      // Cache is full, evict oldest entry
      this.evictOldest();
    }

    // Create new cache entry
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.config.defaultTTL,
      hits: 0,
    };

    this.cache.set(key, entry);
  }

  /**
   * Invalidate a specific cache entry
   * 
   * Requirement 8.5: Invalidate related cache entries when data is updated
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate cache entries matching a pattern
   * Supports wildcard patterns for bulk invalidation
   * 
   * Examples:
   * - invalidatePattern('posts:*') - invalidates all posts cache entries
   * - invalidatePattern('profile:user123:*') - invalidates all cache for user123
   * 
   * Requirement 8.5: Invalidate related cache entries when data is updated
   */
  invalidatePattern(pattern: string): void {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*/g, '.*'); // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);

    // Find and delete all matching keys
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * 
   * Requirement 8.4: Provide cache hit rate monitoring
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 
      ? (this.stats.hits / totalRequests) * 100 
      : 0;

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
      evictions: this.stats.evictions,
    };
  }

  /**
   * Evict the oldest (least recently used) entry from cache
   * 
   * Requirement 8.7: Evict oldest entries using LRU algorithm when cache is full
   */
  evictOldest(): void {
    // Map maintains insertion order, so first key is the oldest
    const firstKey = this.cache.keys().next().value;
    
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Check if key exists in cache (without affecting stats)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    const now = Date.now();
    const age = now - entry.timestamp;
    return age <= entry.ttl;
  }
}
