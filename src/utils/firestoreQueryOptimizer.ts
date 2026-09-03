/**
 * Firestore Query Optimizer
 * 
 * This optimizer reduces Firestore document reads by applying limits, filters,
 * and pagination at the database level, and integrating with the Cache Manager.
 * 
 * Features:
 * - Query building with orderBy, where, and limit clauses
 * - Database-level filtering for posts, matching, messages, places, and profiles
 * - Pagination with startAfter cursors
 * - Cache integration for reduced reads
 * - Query execution with metadata tracking
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 4.3, 4.5, 4.7, 5.1, 5.2, 11.1, 11.2, 11.3
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
  Timestamp,
  WhereFilterOp,
  OrderByDirection,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '../firebase';
import { FirestoreCacheManager } from './firestoreCacheManager';

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
 * Query optimizer configuration
 */
export interface QueryOptimizerConfig {
  collection: string;
  limit: number;
  orderBy?: OrderByClause;
  where?: WhereClause[];
  startAfter?: DocumentSnapshot;
  useCache?: boolean;
  cacheTTL?: number;
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
 * Filter configuration for different collections
 */
export interface FilterConfig {
  // Posts filters
  maxPostAge?: number; // in hours

  // Matching filters
  gender?: string;
  major?: string;
  academicYear?: number;

  // Places filters
  category?: string;

  // Check-ins filters
  includeExpired?: boolean;

  // Events filters
  includePast?: boolean;
}

/**
 * Firestore Query Optimizer
 * 
 * Optimizes Firestore queries by applying limits, filters, and pagination
 * at the database level, and integrating with cache for reduced reads.
 */
export class FirestoreQueryOptimizer {
  private cacheManager: FirestoreCacheManager;

  constructor(cacheManager?: FirestoreCacheManager) {
    this.cacheManager = cacheManager || new FirestoreCacheManager();
  }

  /**
   * Build a Firestore query from configuration
   * 
   * Requirement 1.1: Limit initial query to specified number of documents
   * Requirement 1.2: Use composite index on orderBy fields
   * Requirement 2.1, 2.2, 2.3: Apply filters at database level
   */
  buildQuery(config: QueryOptimizerConfig): Query {
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
   * Execute query with caching integration
   * 
   * Requirement 5.1: Check cache before executing Firestore query
   * Requirement 5.2: Store results in cache with appropriate TTL
   */
  async executeQuery<T>(config: QueryOptimizerConfig): Promise<QueryResult<T>> {
    const startTime = Date.now();

    // Generate cache key
    const cacheKey = this.generateCacheKey(config);

    // Check cache if enabled
    if (config.useCache !== false) {
      const cachedResult = this.cacheManager.get<QueryResult<T>>(cacheKey);
      if (cachedResult) {
        return {
          ...cachedResult,
          fromCache: true,
          executionTime: Date.now() - startTime,
        };
      }
    }

    // Build and execute query
    const firestoreQuery = this.buildQuery(config);
    const snapshot = await getDocs(firestoreQuery);

    // Extract data and metadata
    const data: T[] = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() } as T);
    });

    const lastDoc = snapshot.docs.length > 0 
      ? snapshot.docs[snapshot.docs.length - 1] 
      : null;

    const hasMore = snapshot.docs.length === config.limit;
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
    if (config.useCache !== false) {
      const ttl = config.cacheTTL || 60000; // Default 60 seconds
      this.cacheManager.set(cacheKey, result, ttl);
    }

    return result;
  }

  /**
   * Apply filters at database level
   * 
   * Requirement 1.4: Filter posts older than specified hours
   * Requirement 2.1, 2.2, 2.3: Apply gender, major, academic year filters
   * Requirement 4.3: Apply category filter for places
   * Requirement 4.5: Filter expired check-ins
   * Requirement 4.7: Filter past events
   */
  applyFilters(
    collectionName: string,
    filters: FilterConfig
  ): WhereClause[] {
    const whereClauses: WhereClause[] = [];

    // Posts filters
    if (collectionName === 'posts' && filters.maxPostAge !== undefined) {
      const cutoffTime = Date.now() - (filters.maxPostAge * 60 * 60 * 1000);
      whereClauses.push({
        field: 'createdAt',
        operator: '>',
        value: Timestamp.fromMillis(cutoffTime),
      });
    }

    // Matching filters
    if (collectionName === 'profiles') {
      if (filters.gender) {
        whereClauses.push({
          field: 'gender',
          operator: '==',
          value: filters.gender,
        });
      }

      if (filters.major) {
        whereClauses.push({
          field: 'majorNormalized',
          operator: '==',
          value: filters.major,
        });
      }

      if (filters.academicYear !== undefined) {
        whereClauses.push({
          field: 'academicYear',
          operator: '==',
          value: filters.academicYear,
        });
      }
    }

    // Places filters
    if (collectionName === 'places' && filters.category) {
      whereClauses.push({
        field: 'category',
        operator: '==',
        value: filters.category,
      });
    }

    // Check-ins filters
    if (collectionName === 'checkIns' && !filters.includeExpired) {
      whereClauses.push({
        field: 'expiresAt',
        operator: '>',
        value: Timestamp.fromMillis(Date.now()),
      });
    }

    // Events filters
    if (collectionName === 'events' && !filters.includePast) {
      whereClauses.push({
        field: 'startTime',
        operator: '>',
        value: Timestamp.fromMillis(Date.now()),
      });
    }

    return whereClauses;
  }

  /**
   * Apply pagination with startAfter cursor
   * 
   * Requirement 1.3: Load next page using startAfter cursor
   * Requirement 11.1, 11.2, 11.3: Store lastDoc reference and hasMore flag
   */
  applyPagination(
    baseConfig: QueryOptimizerConfig,
    cursor?: DocumentSnapshot
  ): QueryOptimizerConfig {
    return {
      ...baseConfig,
      startAfter: cursor,
    };
  }

  /**
   * Generate cache key from query configuration
   */
  private generateCacheKey(config: QueryOptimizerConfig): string {
    const parts = [
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
   * Invalidate cache for a collection
   */
  invalidateCache(collectionName: string): void {
    this.cacheManager.invalidatePattern(`${collectionName}|*`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }
}
