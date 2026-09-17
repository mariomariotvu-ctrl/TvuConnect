import { useState, useEffect, useCallback, useRef } from 'react';
import { DocumentData, getDocs, QueryDocumentSnapshot } from 'firebase/firestore';
import { FilterState, DocumentLink, UseDocumentsResult } from '../types/documentLink';
import { buildFirestoreQuery, filterByKeyword } from '../utils/documentFilters';

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
  pageSize: number = 30
): UseDocumentsResult {
  const [documents, setDocuments] = useState<DocumentLink[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDocument, setLastDocument] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const requestIdRef = useRef(0);

  /**
   * Fetch the first page. Firestore's own offline cache remains available, so
   * a second localStorage cache is unnecessary and would lose the page cursor.
   */
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setLastDocument(null);
    const requestId = ++requestIdRef.current;

    try {
      const q = buildFirestoreQuery(filters, pageSize);
      const querySnapshot = await getDocs(q);
      if (requestId !== requestIdRef.current) return;

      const docs = querySnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }) as DocumentLink);

      setDocuments(docs);
      setLastDocument(querySnapshot.docs.at(-1) || null);
      setHasMore(querySnapshot.size === pageSize);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err as Error);
      console.error('Error fetching documents:', err);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [filters, pageSize]);

  /**
   * Load the next page using the last Firestore document as a stable cursor.
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || !lastDocument || loadingMore) return;

    setLoadingMore(true);
    setError(null);
    const requestId = requestIdRef.current;

    try {
      const q = buildFirestoreQuery(filters, pageSize, lastDocument);
      const querySnapshot = await getDocs(q);
      if (requestId !== requestIdRef.current) return;

      const nextDocuments = querySnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }) as DocumentLink);

      setDocuments((current) => {
        const knownIds = new Set(current.map((document) => document.id));
        return [...current, ...nextDocuments.filter((document) => !knownIds.has(document.id))];
      });
      setLastDocument(querySnapshot.docs.at(-1) || lastDocument);
      setHasMore(querySnapshot.size === pageSize);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(err as Error);
      console.error('Error loading more documents:', err);
    } finally {
      if (requestId === requestIdRef.current) setLoadingMore(false);
    }
  }, [filters, hasMore, lastDocument, loadingMore, pageSize]);

  /**
   * Refresh the current filters from the first page.
   */
  const refresh = useCallback(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  /**
   * Optimistically remove a document from local state and cache
   * Used for immediate UI feedback before Firestore confirms deletion
   */
  const removeDocumentOptimistic = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  /**
   * Restore a document back to local state (undo optimistic removal)
   */
  const restoreDocument = useCallback((document: DocumentLink) => {
    setDocuments(prev => {
      const without = prev.filter(d => d.id !== document.id);
      return [document, ...without];
    });
  }, []);

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
    loadingMore,
    loadMore,
    refresh,
    removeDocumentOptimistic,
    restoreDocument
  };
}
