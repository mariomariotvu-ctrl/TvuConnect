/**
 * Property-Based Tests for Query Optimizer
 * 
 * Tests pagination uniqueness property using fast-check:
 * ∀ page1, page2: loadNextPage(page1) ∧ loadNextPage(page2) ⟹ page1 ∩ page2 = ∅
 * 
 * **Validates: Requirements 2.3 (Pagination), Design Property 4 (Pagination Uniqueness)**
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  optimizeQuery,
  createPaginationConfig,
  disableCache,
  type QueryConfig,
  type QueryResult,
} from './queryOptimizer';
import { DocumentSnapshot } from 'firebase/firestore';

// Mock Firebase Firestore
vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, collectionName) => ({ _collection: collectionName })),
  query: vi.fn((...args) => ({ _query: args })),
  where: vi.fn((field, operator, value) => ({ _where: { field, operator, value } })),
  orderBy: vi.fn((field, direction) => ({ _orderBy: { field, direction } })),
  limit: vi.fn((limitValue) => ({ _limit: limitValue })),
  startAfter: vi.fn((cursor) => ({ _startAfter: cursor })),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';

describe('Query Optimizer - Property-Based Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Property: Pagination Uniqueness', () => {
    /**
     * Property Test: Pages should not contain duplicate documents
     * 
     * Given: A collection with N documents
     * When: We paginate through the collection with page size P
     * Then: No document should appear in multiple pages
     * 
     * This test generates random document sets and page sizes,
     * then verifies that pagination produces unique documents across pages.
     */
    it('should return unique documents across all pages', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of documents (10-100 documents)
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              title: fc.string({ minLength: 1, maxLength: 50 }),
              createdAt: fc.date(),
            }),
            { minLength: 10, maxLength: 100 }
          ),
          // Generate page size (5-20 items per page)
          fc.integer({ min: 5, max: 20 }),
          async (documents, pageSize) => {
            // Ensure unique document IDs
            const uniqueDocs = Array.from(
              new Map(documents.map(doc => [doc.id, doc])).values()
            );

            // Skip if we don't have enough unique documents
            if (uniqueDocs.length < 10) return;

            // Mock paginated responses
            let currentPage = 0;
            const totalPages = Math.ceil(uniqueDocs.length / pageSize);

            vi.mocked(getDocs).mockImplementation(async () => {
              const startIdx = currentPage * pageSize;
              const endIdx = Math.min(startIdx + pageSize, uniqueDocs.length);
              const pageDocs = uniqueDocs.slice(startIdx, endIdx);

              const mockDocs = pageDocs.map((doc, idx) => ({
                id: doc.id,
                data: () => ({ title: doc.title, createdAt: doc.createdAt }),
                // Mock DocumentSnapshot for cursor
                ref: { id: doc.id },
              }));

              currentPage++;

              return {
                docs: mockDocs,
                size: mockDocs.length,
                forEach: (callback: any) => mockDocs.forEach(callback),
              } as any;
            });

            // Fetch all pages
            const allPages: any[][] = [];
            let lastDoc: DocumentSnapshot | null = null;
            let hasMore = true;

            currentPage = 0; // Reset for actual test

            while (hasMore && allPages.length < totalPages) {
              const config: QueryConfig = lastDoc
                ? createPaginationConfig(
                    {
                      collection: 'posts',
                      limit: pageSize,
                      orderBy: { field: 'createdAt', direction: 'desc' },
                    },
                    lastDoc
                  )
                : {
                    collection: 'posts',
                    limit: pageSize,
                    orderBy: { field: 'createdAt', direction: 'desc' },
                  };

              const result: QueryResult<any> = await optimizeQuery(
                config,
                disableCache()
              );

              if (result.data.length > 0) {
                allPages.push(result.data);
                lastDoc = result.lastDoc;
                hasMore = result.hasMore;
              } else {
                hasMore = false;
              }
            }

            // Verify: No duplicates across pages
            const allDocIds = allPages.flat().map(doc => doc.id);
            const uniqueDocIds = new Set(allDocIds);

            // Property: All document IDs should be unique
            expect(allDocIds.length).toBe(uniqueDocIds.size);

            // Additional verification: Each page should be disjoint
            for (let i = 0; i < allPages.length; i++) {
              for (let j = i + 1; j < allPages.length; j++) {
                const page1Ids = new Set(allPages[i].map(doc => doc.id));
                const page2Ids = new Set(allPages[j].map(doc => doc.id));

                // Intersection should be empty
                const intersection = new Set(
                  [...page1Ids].filter(id => page2Ids.has(id))
                );

                expect(intersection.size).toBe(0);
              }
            }
          }
        ),
        { numRuns: 100 } // Run 100 test cases as specified in requirements
      );
    });

    /**
     * Property Test: Pagination should preserve order
     * 
     * Given: A collection ordered by a field
     * When: We paginate through the collection
     * Then: Documents should maintain their order across pages
     */
    it('should maintain document order across pages', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate sorted array of documents
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
            }),
            { minLength: 20, maxLength: 50 }
          ),
          fc.integer({ min: 5, max: 10 }),
          async (documents, pageSize) => {
            // Ensure unique IDs and sort by timestamp descending
            const uniqueDocs = Array.from(
              new Map(documents.map(doc => [doc.id, doc])).values()
            ).sort((a, b) => b.timestamp - a.timestamp);

            if (uniqueDocs.length < 20) return;

            // Mock paginated responses
            let currentPage = 0;

            vi.mocked(getDocs).mockImplementation(async () => {
              const startIdx = currentPage * pageSize;
              const endIdx = Math.min(startIdx + pageSize, uniqueDocs.length);
              const pageDocs = uniqueDocs.slice(startIdx, endIdx);

              const mockDocs = pageDocs.map(doc => ({
                id: doc.id,
                data: () => ({ timestamp: doc.timestamp }),
                ref: { id: doc.id },
              }));

              currentPage++;

              return {
                docs: mockDocs,
                size: mockDocs.length,
                forEach: (callback: any) => mockDocs.forEach(callback),
              } as any;
            });

            // Fetch all pages
            const allDocs: any[] = [];
            let lastDoc: DocumentSnapshot | null = null;
            let hasMore = true;

            currentPage = 0;

            while (hasMore && allDocs.length < uniqueDocs.length) {
              const config: QueryConfig = lastDoc
                ? createPaginationConfig(
                    {
                      collection: 'posts',
                      limit: pageSize,
                      orderBy: { field: 'timestamp', direction: 'desc' },
                    },
                    lastDoc
                  )
                : {
                    collection: 'posts',
                    limit: pageSize,
                    orderBy: { field: 'timestamp', direction: 'desc' },
                  };

              const result: QueryResult<any> = await optimizeQuery(
                config,
                disableCache()
              );

              if (result.data.length > 0) {
                allDocs.push(...result.data);
                lastDoc = result.lastDoc;
                hasMore = result.hasMore;
              } else {
                hasMore = false;
              }
            }

            // Verify: Documents are in descending timestamp order
            for (let i = 0; i < allDocs.length - 1; i++) {
              expect(allDocs[i].timestamp).toBeGreaterThanOrEqual(
                allDocs[i + 1].timestamp
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property Test: Total documents across pages equals source
     * 
     * Given: A collection with N documents
     * When: We paginate through all pages
     * Then: Total documents fetched should equal N
     */
    it('should fetch all documents exactly once', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
              data: fc.anything(),
            }),
            { minLength: 15, maxLength: 60 }
          ),
          fc.integer({ min: 5, max: 15 }),
          async (documents, pageSize) => {
            // Ensure unique IDs
            const uniqueDocs = Array.from(
              new Map(documents.map(doc => [doc.id, doc])).values()
            );

            if (uniqueDocs.length < 15) return;

            // Mock paginated responses
            let currentPage = 0;
            const totalPages = Math.ceil(uniqueDocs.length / pageSize);

            vi.mocked(getDocs).mockImplementation(async () => {
              const startIdx = currentPage * pageSize;
              const endIdx = Math.min(startIdx + pageSize, uniqueDocs.length);
              const pageDocs = uniqueDocs.slice(startIdx, endIdx);

              const mockDocs = pageDocs.map(doc => ({
                id: doc.id,
                data: () => ({ data: doc.data }),
                ref: { id: doc.id },
              }));

              currentPage++;

              return {
                docs: mockDocs,
                size: mockDocs.length,
                forEach: (callback: any) => mockDocs.forEach(callback),
              } as any;
            });

            // Fetch all pages
            const allDocs: any[] = [];
            let lastDoc: DocumentSnapshot | null = null;
            let hasMore = true;

            currentPage = 0;

            while (hasMore && allDocs.length < uniqueDocs.length + pageSize) {
              const config: QueryConfig = lastDoc
                ? createPaginationConfig(
                    {
                      collection: 'items',
                      limit: pageSize,
                    },
                    lastDoc
                  )
                : {
                    collection: 'items',
                    limit: pageSize,
                  };

              const result: QueryResult<any> = await optimizeQuery(
                config,
                disableCache()
              );

              if (result.data.length > 0) {
                allDocs.push(...result.data);
                lastDoc = result.lastDoc;
                hasMore = result.hasMore;
              } else {
                hasMore = false;
              }
            }

            // Property: Total fetched should equal source count
            expect(allDocs.length).toBe(uniqueDocs.length);

            // Property: All source IDs should be present
            const fetchedIds = new Set(allDocs.map(doc => doc.id));
            const sourceIds = new Set(uniqueDocs.map(doc => doc.id));

            expect(fetchedIds.size).toBe(sourceIds.size);
            sourceIds.forEach(id => {
              expect(fetchedIds.has(id)).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property Test: hasMore flag accuracy
     * 
     * Given: A collection with N documents and page size P
     * When: We fetch a page
     * Then: hasMore should be true if we fetched exactly P documents (might be more)
     *       hasMore should be false if we fetched less than P documents (no more)
     * 
     * Note: The optimizer sets hasMore based on whether we got exactly the limit,
     * not on actual remaining documents (which it can't know without another query).
     */
    it('should correctly indicate hasMore flag based on fetched count', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 100 }), // Total documents
          fc.integer({ min: 5, max: 20 }), // Page size
          async (totalDocs, pageSize) => {
            const documents = Array.from({ length: totalDocs }, (_, i) => ({
              id: `doc${i}`,
              index: i,
            }));

            // Mock first page response - return min(pageSize, totalDocs)
            vi.mocked(getDocs).mockImplementation(async () => {
              const actualFetch = Math.min(pageSize, totalDocs);
              const pageDocs = documents.slice(0, actualFetch);

              const mockDocs = pageDocs.map(doc => ({
                id: doc.id,
                data: () => ({ index: doc.index }),
                ref: { id: doc.id },
              }));

              return {
                docs: mockDocs,
                size: mockDocs.length,
                forEach: (callback: any) => mockDocs.forEach(callback),
              } as any;
            });

            const config: QueryConfig = {
              collection: 'items',
              limit: pageSize,
            };

            const result: QueryResult<any> = await optimizeQuery(
              config,
              disableCache()
            );

            const actualFetched = Math.min(pageSize, totalDocs);

            // Property: hasMore is true when we fetched exactly the limit
            // (indicates there might be more documents)
            if (actualFetched === pageSize) {
              expect(result.hasMore).toBe(true);
              expect(result.data.length).toBe(pageSize);
            }

            // Property: hasMore is false when we fetched less than the limit
            // (indicates we reached the end)
            if (actualFetched < pageSize) {
              expect(result.hasMore).toBe(false);
              expect(result.data.length).toBeLessThan(pageSize);
            }

            // Property: We never fetch more than the limit
            expect(result.data.length).toBeLessThanOrEqual(pageSize);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property Test: Empty pages should not occur in the middle
     * 
     * Given: A collection with documents
     * When: We paginate through pages
     * Then: Empty pages should only occur at the end
     */
    it('should not return empty pages before reaching the end', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 5, maxLength: 20 }),
            }),
            { minLength: 20, maxLength: 80 }
          ),
          fc.integer({ min: 5, max: 15 }),
          async (documents, pageSize) => {
            const uniqueDocs = Array.from(
              new Map(documents.map(doc => [doc.id, doc])).values()
            );

            if (uniqueDocs.length < 20) return;

            let currentPage = 0;

            vi.mocked(getDocs).mockImplementation(async () => {
              const startIdx = currentPage * pageSize;
              const endIdx = Math.min(startIdx + pageSize, uniqueDocs.length);
              const pageDocs = uniqueDocs.slice(startIdx, endIdx);

              const mockDocs = pageDocs.map(doc => ({
                id: doc.id,
                data: () => ({}),
                ref: { id: doc.id },
              }));

              currentPage++;

              return {
                docs: mockDocs,
                size: mockDocs.length,
                forEach: (callback: any) => mockDocs.forEach(callback),
              } as any;
            });

            const pageSizes: number[] = [];
            let lastDoc: DocumentSnapshot | null = null;
            let hasMore = true;

            currentPage = 0;

            while (hasMore && pageSizes.length < 20) {
              const config: QueryConfig = lastDoc
                ? createPaginationConfig(
                    {
                      collection: 'items',
                      limit: pageSize,
                    },
                    lastDoc
                  )
                : {
                    collection: 'items',
                    limit: pageSize,
                  };

              const result: QueryResult<any> = await optimizeQuery(
                config,
                disableCache()
              );

              pageSizes.push(result.data.length);

              if (result.data.length > 0) {
                lastDoc = result.lastDoc;
                hasMore = result.hasMore;
              } else {
                hasMore = false;
              }
            }

            // Property: Once we get an empty page, all subsequent pages should be empty
            let foundEmpty = false;
            for (const size of pageSizes) {
              if (foundEmpty) {
                expect(size).toBe(0);
              }
              if (size === 0) {
                foundEmpty = true;
              }
            }

            // Property: All non-empty pages should have size > 0
            const nonEmptyPages = pageSizes.filter(size => size > 0);
            nonEmptyPages.forEach(size => {
              expect(size).toBeGreaterThan(0);
              expect(size).toBeLessThanOrEqual(pageSize);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
