/**
 * Query Optimizer with Browser Storage Cache Integration
 * 
 * This optimizer wraps firestoreQueryOptimizer and integrates with
 * the browser storage cache manager (localStorage/sessionStorage).
 * 
 * Features:
 * - Limit enforcement (max 100)
 * - Pagination with startAfter cursor
 * - Where clause application
 * - Cache-first strategy with browser storage
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  Query,
  DocumentSnapshot,
  WhereFilterOp,
  OrderByDirection,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getCachedData, setCachedData, type CacheConfig } from './cacheManager';
import { logger } from '@/utils/logger';

/**
 * Where clause configuration
 */
export interface WhereClause {
  field: string;
  operator: WhereFilterOp;
  value: any;
}

/**
 * OrderBy configuration
 */
export interface OrderByClause {
  field: string;
  direction: OrderByDirection;
}

/**
 * Query configuration
 */
export interface QueryConfig {
  collection: string;
  limit: number;
  orderBy?: OrderByClause;
  where?: WhereClause[];
  startAfter?: DocumentSnapshot;
}

/**
 * Cache configuration for queries
 */
export interface QueryCacheConfig {
  enabled: boolean;
  ttl: number; // milliseconds
  storage: 'localStorage' | 'sessionStorage';
  keyPrefix?: string;
}

/**
 * Query result with metadata
 */
export interface QueryResult<T> {
  data: T[];
  lastDoc: DocumentSnapshot | null;
  hasMore: boolean;
  fromCache: boolean;
  executionTime: number;
  documentReads: number;
}

/**
 * Optimize and execute Firestore query with cache-first strategy
 * 
 * Requirement 2.1: Implement optimizeQuery function
 * Requirement 2.2: Implement limit enforcement (max 100)
 * Requirement 2.3: Implement pagination với startAfter cursor
 * Requirement 2.4: Implement where clause application
 * Requirement 2.5: Integrate với Cache Manager cho cache-first strategy
 */
export async function optimizeQuery<T>(
  config: QueryConfig,
  cacheConfig?: QueryCacheConfig
): Promise<QueryResult<T>> {
  const startTime = Date.now();

  // Requirement 2.2: Enforce limit max 100
  const enforcedLimit = Math.min(config.limit, 100);
  const optimizedConfig = { ...config, limit: enforcedLimit };

  // Generate cache key
  const cacheKey = generateCacheKey(optimizedConfig, cacheConfig?.keyPrefix);

  // Requirement 2.5: Check cache first if enabled
  if (cacheConfig?.enabled) {
    const browserCacheConfig: CacheConfig = {
      key: cacheKey,
      ttl: cacheConfig.ttl,
      storage: cacheConfig.storage,
    };

    const cachedResult = getCachedData<QueryResult<T>>(browserCacheConfig);
    if (cachedResult) {
      return {
        ...cachedResult,
        fromCache: true,
        executionTime: Date.now() - startTime,
      };
    }
  }

  // Build Firestore query
  const firestoreQuery = buildQuery(optimizedConfig);

  // Execute query
  const snapshot = await getDocs(firestoreQuery);

  // Extract data and metadata
  const data: T[] = [];
  snapshot.forEach(doc => {
    data.push({ id: doc.id, ...doc.data() } as T);
  });

  const lastDoc = snapshot.docs.length > 0 
    ? snapshot.docs[snapshot.docs.length - 1] 
    : null;

  const hasMore = snapshot.docs.length === enforcedLimit;
  const executionTime = Date.now() - startTime;
  const documentReads = snapshot.size;

  const result: QueryResult<T> = {
    data,
    lastDoc,
    hasMore,
    fromCache: false,
    executionTime,
    documentReads,
  };

  // Store in cache if enabled
  if (cacheConfig?.enabled) {
    const browserCacheConfig: CacheConfig = {
      key: cacheKey,
      ttl: cacheConfig.ttl,
      storage: cacheConfig.storage,
    };

    // Don't cache the lastDoc (DocumentSnapshot) as it's not serializable
    const cacheableResult = {
      ...result,
      lastDoc: null, // Will be handled separately in pagination
    };

    try {
      setCachedData(browserCacheConfig, cacheableResult);
    } catch (error) {
      logger.warn('Failed to cache query result:', error);
    }
  }

  return result;
}

/**
 * Build Firestore query from configuration
 * 
 * Requirement 2.3: Implement pagination với startAfter cursor
 * Requirement 2.4: Implement where clause application
 */
function buildQuery(config: QueryConfig): Query {
  const constraints: QueryConstraint[] = [];

  // Apply where clauses
  if (config.where && config.where.length > 0) {
    config.where.forEach(clause => {
      constraints.push(where(clause.field, clause.operator, clause.value));
    });
  }

  // Apply orderBy
  if (config.orderBy) {
    constraints.push(orderBy(config.orderBy.field, config.orderBy.direction));
  }

  // Apply pagination cursor
  if (config.startAfter) {
    constraints.push(startAfter(config.startAfter));
  }

  // Apply limit
  constraints.push(limit(config.limit));

  // Build and return query
  const collectionRef = collection(db, config.collection);
  return query(collectionRef, ...constraints);
}

/**
 * Generate cache key from query configuration
 */
function generateCacheKey(config: QueryConfig, prefix?: string): string {
  const parts = [
    prefix || 'query',
    config.collection,
    `limit:${config.limit}`,
  ];

  if (config.orderBy) {
    parts.push(`orderBy:${config.orderBy.field}:${config.orderBy.direction}`);
  }

  if (config.where && config.where.length > 0) {
    const whereStr = config.where
      .map(w => `${w.field}${w.operator}${JSON.stringify(w.value)}`)
      .join('&');
    parts.push(`where:${whereStr}`);
  }

  if (config.startAfter) {
    parts.push(`cursor:${config.startAfter.id}`);
  }

  return parts.join('|');
}

/**
 * Helper function to create pagination config
 * 
 * Requirement 2.3: Implement pagination với startAfter cursor
 */
export function createPaginationConfig(
  baseConfig: QueryConfig,
  cursor?: DocumentSnapshot
): QueryConfig {
  return {
    ...baseConfig,
    startAfter: cursor,
  };
}

/**
 * Helper function to create cache config with defaults
 */
export function createCacheConfig(
  ttl: number,
  storage: 'localStorage' | 'sessionStorage' = 'sessionStorage',
  keyPrefix?: string
): QueryCacheConfig {
  return {
    enabled: true,
    ttl,
    storage,
    keyPrefix,
  };
}

/**
 * Disable cache for a query
 */
export function disableCache(): QueryCacheConfig {
  return {
    enabled: false,
    ttl: 0,
    storage: 'sessionStorage',
  };
}
