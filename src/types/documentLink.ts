import { Timestamp } from 'firebase/firestore';

/**
 * Document Link - Represents a link to an academic document
 * Stores metadata and URL only, no actual file storage
 */
export interface DocumentLink {
  id: string;                    // Firestore auto-generated ID
  title: string;                 // 3-200 characters
  major_id: string;              // Major identifier (e.g., 'cntt')
  subject: string;               // Subject name
  category: string;              // Document category
  url: string;                   // External URL (validated)
  description: string;           // Max 500 characters
  createdAt: Timestamp;          // Server timestamp
  createdBy: string;             // User UID
  updatedAt?: Timestamp;         // Optional update timestamp
}

/**
 * Filter State - Current active filters
 */
export interface FilterState {
  major_id: string | null;
  subject: string | null;
  category: string | null;
}

/**
 * Document Form Data - Data for creating/editing documents
 */
export interface DocumentFormData {
  title: string;
  major_id: string;
  subject: string;
  category: string;
  url: string;
  description: string;
}

/**
 * Validation Error - Form validation error
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * URL Validation Result
 */
export interface URLValidation {
  isValid: boolean;
  isTrusted: boolean;
  warning?: string;
}

/**
 * URL Security Result
 */
export interface URLSecurityResult {
  canProceed: boolean;
  warning: string | null;
}

/**
 * Use Documents Hook Result
 */
export interface UseDocumentsResult {
  documents: DocumentLink[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => void;
  removeDocumentOptimistic: (id: string) => void;
  restoreDocument: (document: DocumentLink) => void;
}
