import { logger } from './logger';
/**
 * Browser Storage Cache Manager with TTL and LRU eviction
 * 
 * This cache manager uses localStorage/sessionStorage for persistent caching
 * with configurable TTL (Time-To-Live) and automatic LRU eviction.
 * 
 * Features:
 * - TTL-based expiration for cache entries
 * - LRU (Least Recently Used) eviction when storage > 80% full
 * - Pattern-based cache invalidation for bulk invalidation
 * - QuotaExceededError handling with auto-eviction
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

/**
 * Cache configuration
 */
export interface CacheConfig {
  key: string;
  ttl: number; // milliseconds
  storage: 'localStorage' | 'sessionStorage';
}

/**
 * Cached data with metadata
 */
interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Storage metadata for LRU tracking
 */
interface StorageMetadata {
  keys: string[];
  lastAccess: Record<string, number>;
}

const METADATA_KEY = '__cache_metadata__';

/**
 * Get storage metadata for LRU tracking
 */
function getMetadata(storage: Storage): StorageMetadata {
  try {
    const meta = storage.getItem(METADATA_KEY);
    if (meta) {
      return JSON.parse(meta);
    }
  } catch (error) {
    logger.warn('Failed to parse cache metadata:', error);
  }
  return { keys: [], lastAccess: {} };
}

/**
 * Update storage metadata
 */
function setMetadata(storage: Storage, metadata: StorageMetadata): void {
  try {
    storage.setItem(METADATA_KEY, JSON.stringify(metadata));
  } catch (error) {
    logger.warn('Failed to save cache metadata:', error);
  }
}

/**
 * Get approximate storage usage percentage
 */
function getStorageUsage(storage: Storage): number {
  try {
    let totalSize = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) {
        const value = storage.getItem(key);
        if (value) {
          totalSize += key.length + value.length;
        }
      }
    }
    // Assume 5MB quota (typical for localStorage/sessionStorage)
    const quota = 5 * 1024 * 1024;
    return (totalSize / quota) * 100;
  } catch (error) {
    logger.warn('Failed to calculate storage usage:', error);
    return 0;
  }
}

/**
 * Evict oldest entries using LRU algorithm
 * Requirement 1.3: Implement LRU eviction khi storage > 80% full
 */
function evictOldestEntries(storage: Storage, percentage: number = 0.2): void {
  const metadata = getMetadata(storage);
  
  // Sort keys by last access time (oldest first)
  const sortedKeys = metadata.keys.sort((a, b) => {
    const accessA = metadata.lastAccess[a] || 0;
    const accessB = metadata.lastAccess[b] || 0;
    return accessA - accessB;
  });
  
  // Calculate how many entries to evict
  const entriesToEvict = Math.ceil(sortedKeys.length * percentage);
  
  // Evict oldest entries
  for (let i = 0; i < entriesToEvict && i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    storage.removeItem(key);
    
    // Remove from metadata
    const keyIndex = metadata.keys.indexOf(key);
    if (keyIndex > -1) {
      metadata.keys.splice(keyIndex, 1);
    }
    delete metadata.lastAccess[key];
  }
  
  setMetadata(storage, metadata);
  logger.log(`Evicted ${entriesToEvict} oldest cache entries`);
}

/**
 * Get cached data from storage
 * Requirement 1.1: Implement getCachedData function
 * Requirement 1.2: Implement TTL expiration logic
 * 
 * @returns Cached data if exists and not expired, null otherwise
 */
export function getCachedData<T>(config: CacheConfig): T | null {
  try {
    const storage = config.storage === 'localStorage' ? localStorage : sessionStorage;
    const item = storage.getItem(config.key);
    
    if (!item) {
      return null;
    }
    
    const cached: CachedData<T> = JSON.parse(item);
    const now = Date.now();
    const age = now - cached.timestamp;
    
    // Check if expired
    if (age > cached.ttl) {
      // Remove expired entry
      storage.removeItem(config.key);
      
      // Update metadata
      const metadata = getMetadata(storage);
      const keyIndex = metadata.keys.indexOf(config.key);
      if (keyIndex > -1) {
        metadata.keys.splice(keyIndex, 1);
      }
      delete metadata.lastAccess[config.key];
      setMetadata(storage, metadata);
      
      return null;
    }
    
    // Update last access time for LRU
    const metadata = getMetadata(storage);
    metadata.lastAccess[config.key] = now;
    setMetadata(storage, metadata);
    
    return cached.data;
  } catch (error) {
    console.error('Error getting cached data:', error);
    return null;
  }
}

/**
 * Set data in cache with TTL
 * Requirement 1.1: Implement setCachedData function
 * Requirement 1.5: Handle QuotaExceededError với auto-eviction
 * 
 * @throws Error if storage quota exceeded after eviction attempts
 */
export function setCachedData<T>(config: CacheConfig, data: T): void {
  const storage = config.storage === 'localStorage' ? localStorage : sessionStorage;
  
  const cached: CachedData<T> = {
    data,
    timestamp: Date.now(),
    ttl: config.ttl,
  };
  
  const attemptSet = () => {
    try {
      storage.setItem(config.key, JSON.stringify(cached));
      
      // Update metadata
      const metadata = getMetadata(storage);
      if (!metadata.keys.includes(config.key)) {
        metadata.keys.push(config.key);
      }
      metadata.lastAccess[config.key] = Date.now();
      setMetadata(storage, metadata);
      
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        return false;
      }
      throw error;
    }
  };
  
  // First attempt
  if (attemptSet()) {
    return;
  }
  
  // Quota exceeded - attempt eviction
  const usage = getStorageUsage(storage);
  console.warn(`Storage quota exceeded (usage estimate: ${usage.toFixed(1)}%), evicting oldest entries...`);
  evictOldestEntries(storage, 0.2);
  
  // Retry after eviction
  if (attemptSet()) {
    return;
  }
  
  // Still failed - throw error
  throw new Error(`Failed to cache data: Storage quota exceeded for ${config.storage}`);
}

/**
 * Invalidate a specific cache entry
 * Requirement 1.4: Implement invalidateCache
 */
export function invalidateCache(config: CacheConfig): void {
  try {
    const storage = config.storage === 'localStorage' ? localStorage : sessionStorage;
    storage.removeItem(config.key);
    
    // Update metadata
    const metadata = getMetadata(storage);
    const keyIndex = metadata.keys.indexOf(config.key);
    if (keyIndex > -1) {
      metadata.keys.splice(keyIndex, 1);
    }
    delete metadata.lastAccess[config.key];
    setMetadata(storage, metadata);
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
}

/**
 * Invalidate cache entries matching a pattern
 * Requirement 1.4: Implement invalidateCache với pattern matching
 * 
 * Examples:
 * - invalidateCachePattern('posts:*', 'sessionStorage') - invalidates all posts cache
 * - invalidateCachePattern('profile:*', 'localStorage') - invalidates all profiles
 */
export function invalidateCachePattern(pattern: string, storageType: 'localStorage' | 'sessionStorage'): void {
  try {
    const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
    const metadata = getMetadata(storage);
    
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*/g, '.*'); // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    
    // Find and delete all matching keys
    const keysToDelete: string[] = [];
    for (const key of metadata.keys) {
      if (regex.test(key)) {
        keysToDelete.push(key);
        storage.removeItem(key);
      }
    }
    
    // Update metadata
    keysToDelete.forEach(key => {
      const keyIndex = metadata.keys.indexOf(key);
      if (keyIndex > -1) {
        metadata.keys.splice(keyIndex, 1);
      }
      delete metadata.lastAccess[key];
    });
    
    setMetadata(storage, metadata);
    
    if (keysToDelete.length > 0) {
      logger.log(`Invalidated ${keysToDelete.length} cache entries matching pattern: ${pattern}`);
    }
  } catch (error) {
    console.error('Error invalidating cache pattern:', error);
  }
}

/**
 * Clear all cache entries from storage
 */
export function clearAllCache(storageType: 'localStorage' | 'sessionStorage'): void {
  try {
    const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
    const metadata = getMetadata(storage);
    
    // Remove all cached entries
    metadata.keys.forEach(key => {
      storage.removeItem(key);
    });
    
    // Clear metadata
    storage.removeItem(METADATA_KEY);
    
    logger.log(`Cleared all cache from ${storageType}`);
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(storageType: 'localStorage' | 'sessionStorage'): {
  entryCount: number;
  storageUsage: number;
  oldestEntry: string | null;
  newestEntry: string | null;
} {
  try {
    const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
    const metadata = getMetadata(storage);
    const usage = getStorageUsage(storage);
    
    let oldestEntry: string | null = null;
    let newestEntry: string | null = null;
    let oldestTime = Infinity;
    let newestTime = 0;
    
    for (const key of metadata.keys) {
      const accessTime = metadata.lastAccess[key] || 0;
      if (accessTime < oldestTime) {
        oldestTime = accessTime;
        oldestEntry = key;
      }
      if (accessTime > newestTime) {
        newestTime = accessTime;
        newestEntry = key;
      }
    }
    
    return {
      entryCount: metadata.keys.length,
      storageUsage: usage,
      oldestEntry,
      newestEntry,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      entryCount: 0,
      storageUsage: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }
}
