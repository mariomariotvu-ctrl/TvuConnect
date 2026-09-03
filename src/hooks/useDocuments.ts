import { useState, useEffect, useCallback } from 'react';
import { getDocs } from 'firebase/firestore';
import { FilterState, DocumentLink, UseDocumentsResult } from '../types/documentLink';
import { buildFirestoreQuery, filterByKeyword } from '../utils/documentFilters';

const CACHE_TTL = 60000; // 60 seconds

/**
 * Custom hook for fetching and managing document data
 * @param filters - Current filter state
 * @param searchKeyword - Search keyword
 * @param pageSize - Number of documents per page
 * @returns Documents, loading state, and pagination controls
 */
export function useDocuments(
  filters: FilterState,
  searchKeyword: string,
  pageSize: number = 20
): UseDocumentsResult {
  const [documents, setDocuments] = useState<DocumentLink[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);

  // Generate cache key based on filters
  const cacheKey = `docs_${JSON.stringify(filters)}`;

  /**
   * Fetch documents from Firestore or cache
   */
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Check cache first
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);

      if (cachedData && cacheTimestamp) {
        const age = Date.now() - parseInt(cacheTimestamp);
        if (age < CACHE_TTL) {
          // Use cached data
          const cached = JSON.parse(cachedData);
          setDocuments(cached);
          setHasMore(cached.length >= pageSize);
          setLoading(false);
          return;
        }
      }

      // Fetch from Firestore
      const q = buildFirestoreQuery(filters, pageSize);
      const querySnapshot = await getDocs(q);

      const docs: DocumentLink[] = [];
      querySnapshot.forEach((doc) => {
        docs.push({
          id: doc.id,
          ...doc.data()
        } as DocumentLink);
      });

      // Cache the results
      localStorage.setItem(cacheKey, JSON.stringify(docs));
      localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());

      setDocuments(docs);
      setHasMore(docs.length >= pageSize);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, pageSize, cacheKey]);

  /**
   * Load more documents (pagination)
   * Note: Pagination with startAfter will be implemented in future version
   */
  const loadMore = useCallback(async () => {
    // Pagination not yet implemented - will add in future update
    return;
  }, []);

  /**
   * Refresh documents (clear cache and refetch)
   */
  const refresh = useCallback(() => {
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(`${cacheKey}_timestamp`);
    fetchDocuments();
  }, [cacheKey, fetchDocuments]);

  /**
   * Optimistically remove a document from local state and cache
   * Used for immediate UI feedback before Firestore confirms deletion
   */
  const removeDocumentOptimistic = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    // Update cache data AND refresh timestamp so remount reads updated list
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const docs = JSON.parse(cached) as DocumentLink[];
        const updated = docs.filter(d => d.id !== id);
        localStorage.setItem(cacheKey, JSON.stringify(updated));
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
      }
    } catch (_) {}
  }, [cacheKey]);

  /**
   * Restore a document back to local state (undo optimistic removal)
   */
  const restoreDocument = useCallback((document: DocumentLink) => {
    setDocuments(prev => {
      const without = prev.filter(d => d.id !== document.id);
      return [document, ...without];
    });
    // Update cache AND timestamp so remount reads restored list
    try {
      const cached = localStorage.getItem(cacheKey);
      const docs: DocumentLink[] = cached ? JSON.parse(cached) : [];
      const without = docs.filter(d => d.id !== document.id);
      const restored = [document, ...without];
      localStorage.setItem(cacheKey, JSON.stringify(restored));
      localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
    } catch (_) {}
  }, [cacheKey]);

  // Fetch documents when filters change
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Apply client-side keyword filtering
  const filteredDocuments = filterByKeyword(documents, searchKeyword);

  return {
    documents: filteredDocuments,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    removeDocumentOptimistic,
    restoreDocument
  };
}
