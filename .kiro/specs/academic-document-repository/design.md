# Design Document: Academic Document Repository

## Overview

The Academic Document Repository is a URL-based document management system for TVU Connect that allows students to share and discover academic resources organized by major and subject. The system stores only metadata and URLs, not actual files, optimizing for minimal storage costs while maximizing accessibility.

### Key Design Principles

1. **URL-Only Storage**: Store document metadata and links, never upload files to Firebase Storage
2. **Firestore-First**: Leverage Firestore's querying capabilities for filtering and search
3. **Mobile-First UI**: Responsive design optimized for mobile student usage
4. **Integration**: Seamless integration with existing TVU Connect authentication and theme systems
5. **Performance**: Pagination, caching, and indexed queries for fast load times

### Design Goals

- Enable students to share academic resources without storage costs
- Provide fast, filtered access to study materials by major only
- Maintain security through Firestore rules and URL validation
- Ensure mobile-friendly experience for on-the-go access
- **Simplified filtering**: Use only Major filter for better UX; users can search for specific subjects/categories using the search bar

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TVU Connect App                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Auth       │  │   Theme      │  │  Navigation  │      │
│  │   System     │  │   System     │  │    Bar       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │        Document Repository Component                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │   Search    │  │   Major     │  │  Document   │  │  │
│  │  │     Bar     │  │   Filter    │  │    Grid     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  │  ┌─────────────┐  ┌─────────────┐                    │  │
│  │  │   Create    │  │    Edit     │                    │  │
│  │  │    Modal    │  │    Modal    │                    │  │
│  │  └─────────────┘  └─────────────┘                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Firebase Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Firestore   │  │     Auth     │  │   Security   │      │
│  │  Database    │  │   Service    │  │    Rules     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
DocumentRepository (Main Component)
├── SearchBar
├── FilterPanel
│   └── MajorFilter (Dropdown only)
├── ActiveFilters (Tag Display - Major only)
├── DocumentGrid
│   └── DocumentCard (Multiple)
│       ├── DocumentInfo
│       ├── TagDisplay
│       └── ActionButtons
├── CreateDocumentModal
│   └── DocumentForm (includes Subject & Category for metadata)
├── EditDocumentModal
│   └── DocumentForm (includes Subject & Category for metadata)
└── PaginationControls
```

### Data Flow

```
User Action → Component State Update → Firestore Query → 
Result Processing → Cache Update → UI Render
```

**Example: Filter Selection Flow**
```
1. User selects Major "CNTT"
2. FilterPanel updates state: { major_id: "cntt" }
3. useDocuments hook triggers Firestore query:
   query(collection(db, 'documentLinks'), 
         where('major_id', '==', 'cntt'),
         orderBy('createdAt', 'desc'),
         limit(20))
4. Results cached in localStorage (60s TTL)
5. DocumentGrid re-renders with filtered cards
6. User can search for specific subjects/categories using search bar
```

## Components and Interfaces

### 1. DocumentRepository Component

**Purpose**: Main container component managing state and orchestrating child components

**Props**:
```typescript
interface DocumentRepositoryProps {
  currentUser: User;
  onProfileClick?: (uid: string) => void;
}
```

**State**:
```typescript
interface DocumentRepositoryState {
  documents: DocumentLink[];
  loading: boolean;
  filters: FilterState;
  searchKeyword: string;
  showCreateModal: boolean;
  showEditModal: boolean;
  editingDocument: DocumentLink | null;
  page: number;
  hasMore: boolean;
}

interface FilterState {
  major_id: string | null;  // Only major filter in UI
}
```

**Key Methods**:
- `handleFilterChange(filterType, value)`: Update filter state and trigger query
- `handleSearch(keyword)`: Debounced search with 300ms delay
- `handleCreateDocument(data)`: Create new document link
- `handleEditDocument(id, data)`: Update existing document
- `handleDeleteDocument(id)`: Delete document with confirmation
- `loadMore()`: Load next page of results

### 2. DocumentCard Component

**Purpose**: Display individual document information with actions

**Props**:
```typescript
interface DocumentCardProps {
  document: DocumentLink;
  currentUser: User;
  onEdit: (document: DocumentLink) => void;
  onDelete: (id: string) => void;
}
```

**Rendering Logic**:
```typescript
// Tag colors based on type
const tagColors = {
  major: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  subject: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  category: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
};

// Truncate description
const truncatedDescription = document.description.length > 100
  ? document.description.substring(0, 100) + '...'
  : document.description;

// Show edit/delete only for owner
const isOwner = document.createdBy === currentUser.uid;
```

### 3. FilterPanel Component

**Purpose**: Provide dropdown selector for filtering documents by major only

**Props**:
```typescript
interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filterType: string, value: string | null) => void;
}
```

**Filter Options**:
```typescript
const MAJORS = [
  { id: 'cntt', label: 'Công nghệ thông tin' },
  { id: 'kinh-te', label: 'Kinh tế' },
  { id: 'luat', label: 'Luật' },
  { id: 'su-pham', label: 'Sư phạm' },
  { id: 'nong-nghiep', label: 'Nông nghiệp' },
  { id: 'khoa-hoc-tu-nhien', label: 'Khoa học tự nhiên' }
];

// Note: Subject and Category filters removed from UI for simplicity
// Users can search for specific subjects/categories using the search bar
// Subject and Category fields remain in data model and creation form for metadata
```

### 4. CreateDocumentModal Component

**Purpose**: Form for adding new document links

**Props**:
```typescript
interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DocumentFormData) => Promise<void>;
  currentUser: User;
}

interface DocumentFormData {
  title: string;
  major_id: string;
  subject: string;
  category: string;
  url: string;
  description: string;
}
```

**Validation Rules**:
```typescript
const validateForm = (data: DocumentFormData): ValidationResult => {
  const errors: string[] = [];
  
  // Title validation
  if (data.title.length < 3) {
    errors.push('Tiêu đề phải có ít nhất 3 ký tự');
  }
  if (data.title.length > 200) {
    errors.push('Tiêu đề không được vượt quá 200 ký tự');
  }
  
  // URL validation
  const urlPattern = /^https?:\/\/.+/;
  if (!urlPattern.test(data.url)) {
    errors.push('URL phải bắt đầu bằng http:// hoặc https://');
  }
  
  // Description validation
  if (data.description.length > 500) {
    errors.push('Mô tả không được vượt quá 500 ký tự');
  }
  
  // Required fields
  if (!data.major_id || !data.subject || !data.category) {
    errors.push('Vui lòng điền đầy đủ thông tin bắt buộc');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};
```

### 5. useDocuments Hook

**Purpose**: Custom hook for fetching and managing document data

**Interface**:
```typescript
interface UseDocumentsResult {
  documents: DocumentLink[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => void;
}

function useDocuments(
  filters: FilterState,
  searchKeyword: string,
  pageSize: number = 20
): UseDocumentsResult
```

**Implementation Strategy**:
```typescript
// 1. Build Firestore query based on filters (major only)
const buildQuery = () => {
  let q = query(
    collection(db, 'documentLinks'),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );
  
  // Add major filter only
  if (filters.major_id) {
    q = query(q, where('major_id', '==', filters.major_id));
  }
  
  return q;
};

// 2. Client-side search filtering (for subjects, categories, keywords)
const filterByKeyword = (docs: DocumentLink[]) => {
  if (!searchKeyword) return docs;
  
  const keyword = searchKeyword.toLowerCase();
  return docs.filter(doc => 
    doc.title.toLowerCase().includes(keyword) ||
    doc.subject.toLowerCase().includes(keyword) ||
    doc.category.toLowerCase().includes(keyword)
  );
};

// 3. Caching strategy
const cacheKey = `docs_${filters.major_id || 'all'}`;
const cachedData = localStorage.getItem(cacheKey);
const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);

if (cachedData && cacheTimestamp) {
  const age = Date.now() - parseInt(cacheTimestamp);
  if (age < 60000) { // 60 seconds TTL
    return JSON.parse(cachedData);
  }
}
```

## Data Models

### DocumentLink Model

```typescript
interface DocumentLink {
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
```

### Firestore Collection Structure

**Collection**: `documentLinks`

**Document ID**: Auto-generated by Firestore

**Example Document**:
```json
{
  "id": "abc123xyz",
  "title": "Đề thi giữa kỳ Cấu trúc dữ liệu 2024",
  "major_id": "cntt",
  "subject": "Cấu trúc dữ liệu",
  "category": "Đề thi",
  "url": "https://drive.google.com/file/d/...",
  "description": "Đề thi giữa kỳ môn Cấu trúc dữ liệu năm 2024, bao gồm 5 câu hỏi lý thuyết và 3 bài tập thực hành.",
  "createdAt": Timestamp(2024-04-18 10:30:00),
  "createdBy": "user123uid",
  "updatedAt": Timestamp(2024-04-18 11:00:00)
}
```

### Firestore Indexes

Required composite indexes for optimal query performance:

```json
{
  "indexes": [
    {
      "collectionGroup": "documentLinks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "major_id", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

**Note**: Only one composite index is needed since we're filtering by major_id only. Subject and category filtering removed from UI.

### URL Validation Model

```typescript
interface URLValidation {
  isValid: boolean;
  isTrusted: boolean;
  warning?: string;
}

const TRUSTED_DOMAINS = [
  'drive.google.com',
  'docs.google.com',
  'onedrive.live.com',
  'dropbox.com',
  'github.com',
  'tvu.edu.vn'
];

function validateURL(url: string): URLValidation {
  // Check URL format
  const urlPattern = /^https?:\/\/.+/;
  if (!urlPattern.test(url)) {
    return {
      isValid: false,
      isTrusted: false,
      warning: 'URL không hợp lệ'
    };
  }
  
  // Check trusted domain
  const domain = new URL(url).hostname;
  const isTrusted = TRUSTED_DOMAINS.some(trusted => 
    domain.includes(trusted)
  );
  
  return {
    isValid: true,
    isTrusted,
    warning: isTrusted ? undefined : 'URL này chưa được xác minh. Vui lòng kiểm tra kỹ trước khi truy cập'
  };
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following testable properties and performed redundancy elimination:

**Redundant Properties Eliminated:**
- Property 1.3 and 8.1 both test URL format validation → Combined into Property 1
- Property 5.3 and 8.5 both test rel="noopener noreferrer" → Combined into Property 2

**Properties Grouped by Functionality:**
- Data Validation: Properties 1-5 (URL, title, description, field presence, createdBy)
- Filtering Logic: Properties 6-10 (major, subject, category, combined filters, filter removal)
- Search Functionality: Properties 11-13 (keyword search, search + filters, empty search)
- Display Logic: Properties 14-15 (card content, description truncation)
- CRUD Operations: Properties 16-20 (create, update, delete, ownership, list refresh)
- Security: Properties 21-22 (trusted domains, XSS prevention)
- Performance: Properties 23-24 (pagination, caching)

### Property 1: URL Format Validation

*For any* document link submission, the URL field must match the pattern `https?://.*` before the document can be stored in Firestore.

**Validates: Requirements 1.3, 8.1**

### Property 2: External Link Security

*For any* document card rendering, when the "Truy cập tài liệu" button is rendered, it must include both `target="_blank"` and `rel="noopener noreferrer"` attributes for security.

**Validates: Requirements 5.3, 8.5**

### Property 3: Title Length Validation

*For any* document link submission, the title field must have a minimum of 3 characters and a maximum of 200 characters, otherwise validation should fail.

**Validates: Requirements 1.4**

### Property 4: Description Length Validation

*For any* document link submission, if a description is provided, it must not exceed 500 characters, otherwise validation should fail.

**Validates: Requirements 1.5**

### Property 5: Required Fields Presence

*For any* created document link, all required fields (id, title, major_id, subject, category, url, description, createdAt, createdBy) must be present in the Firestore document.

**Validates: Requirements 1.2**

### Property 6: CreatedBy Matches Current User

*For any* document link creation, the createdBy field must equal the authenticated user's UID.

**Validates: Requirements 1.8**

### Property 7: Major Filter Accuracy

*For any* major filter selection, all returned documents must have a major_id field that exactly matches the selected major value.

**Validates: Requirements 2.3**

### Property 8: Combined Major and Subject Filter

*For any* combination of major and subject filter selections, all returned documents must have both major_id matching the selected major AND subject matching the selected subject.

**Validates: Requirements 2.4**

### Property 9: Default Sorting Order

*For any* query with no filters applied, all returned documents must be ordered by createdAt timestamp in descending order (newest first).

**Validates: Requirements 2.5**

### Property 10: Category Filter Accuracy

*For any* category filter selection, all returned documents must have a category field that exactly matches the selected category value.

**Validates: Requirements 3.2**

### Property 11: Multiple Filters AND Logic

*For any* combination of major, subject, and category filters, all returned documents must satisfy ALL selected filter criteria simultaneously (AND logic).

**Validates: Requirements 3.3**

### Property 12: Filter Removal Updates Results

*For any* active filter that is removed, the document list must update to show documents that no longer need to match the removed filter criterion.

**Validates: Requirements 3.5**

### Property 13: Case-Insensitive Keyword Search

*For any* search keyword entered, all returned documents must have titles that contain the keyword in a case-insensitive manner.

**Validates: Requirements 4.2**

### Property 14: Search and Filter Combination

*For any* combination of search keyword and active filters, all returned documents must satisfy both the keyword match AND all filter criteria.

**Validates: Requirements 4.4**

### Property 15: Empty Search Shows Filtered Results

*For any* state where the search keyword is empty, all documents matching the current active filters must be displayed.

**Validates: Requirements 4.5**

### Property 16: Document Card Content Completeness

*For any* rendered document card, the displayed content must include title, major tag, subject tag, category tag, and description preview.

**Validates: Requirements 5.1**

### Property 17: Description Truncation

*For any* document with a description longer than 100 characters, the displayed description in the card must be truncated to 100 characters with an ellipsis appended.

**Validates: Requirements 5.5**

### Property 18: Form Validation Before Submission

*For any* document creation or edit form submission, if any required field (title, major_id, subject, category, url) is missing or invalid, the submission must be prevented and validation errors must be shown.

**Validates: Requirements 7.3**

### Property 19: Document Creation Persistence

*For any* valid document form submission, a new document must be created in Firestore and subsequently appear in the document list.

**Validates: Requirements 7.4, 7.8**

### Property 20: Document Update Persistence

*For any* valid edit form submission on an existing document, the document's fields in Firestore must be updated to match the submitted values.

**Validates: Requirements 9.3**

### Property 21: Document Deletion Persistence

*For any* confirmed deletion action, the document must be removed from Firestore and no longer appear in the document list.

**Validates: Requirements 9.5**

### Property 22: Ownership-Based Action Visibility

*For any* document card displayed, the "Chỉnh sửa" and "Xóa" buttons must be visible if and only if the current user's UID matches the document's createdBy field.

**Validates: Requirements 9.1**

### Property 23: Trusted Domain Validation

*For any* URL submitted, if the domain is in the trusted list (Google Drive, OneDrive, Dropbox, GitHub, tvu.edu.vn), it must be accepted without warnings; otherwise, a warning message must be displayed.

**Validates: Requirements 8.2, 8.3**

### Property 24: XSS Prevention Through Sanitization

*For any* URL input containing special characters (e.g., `<`, `>`, `"`, `'`), those characters must be encoded before storage to prevent XSS attacks.

**Validates: Requirements 8.4**

### Property 25: Pagination Page Size

*For any* initial document query or pagination request, the number of documents returned must not exceed 20 documents per page.

**Validates: Requirements 11.1**

### Property 26: Cache TTL Enforcement

*For any* cached filter options (majors, subjects, categories) in localStorage, if the cache age exceeds 24 hours, the cache must be invalidated and fresh data must be fetched.

**Validates: Requirements 11.2**

## Error Handling

### Validation Errors

**Client-Side Validation**:
```typescript
interface ValidationError {
  field: string;
  message: string;
}

const validateDocumentForm = (data: DocumentFormData): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  // Title validation
  if (!data.title || data.title.trim().length < 3) {
    errors.push({ field: 'title', message: 'Tiêu đề phải có ít nhất 3 ký tự' });
  }
  if (data.title && data.title.length > 200) {
    errors.push({ field: 'title', message: 'Tiêu đề không được vượt quá 200 ký tự' });
  }
  
  // URL validation
  if (!data.url || !data.url.match(/^https?:\/\/.+/)) {
    errors.push({ field: 'url', message: 'URL phải bắt đầu bằng http:// hoặc https://' });
  }
  
  // Description validation
  if (data.description && data.description.length > 500) {
    errors.push({ field: 'description', message: 'Mô tả không được vượt quá 500 ký tự' });
  }
  
  // Required fields
  if (!data.major_id) {
    errors.push({ field: 'major_id', message: 'Vui lòng chọn ngành học' });
  }
  if (!data.subject) {
    errors.push({ field: 'subject', message: 'Vui lòng chọn môn học' });
  }
  if (!data.category) {
    errors.push({ field: 'category', message: 'Vui lòng chọn loại tài liệu' });
  }
  
  return errors;
};
```

**Error Display Strategy**:
- Show validation errors inline below each form field
- Use red text and border for invalid fields
- Display toast notification for form-level errors
- Prevent form submission until all errors are resolved

### Firestore Operation Errors

**Error Types and Handling**:

1. **Permission Denied (403)**
   - Cause: User attempting to edit/delete document they don't own
   - Handling: Show toast "Bạn không có quyền thực hiện thao tác này"
   - Recovery: Refresh document list to ensure UI matches permissions

2. **Network Error**
   - Cause: No internet connection or Firestore unreachable
   - Handling: Show toast "Không thể kết nối. Vui lòng kiểm tra mạng"
   - Recovery: Retry with exponential backoff (1s, 2s, 4s)

3. **Quota Exceeded**
   - Cause: Firestore read/write quota limit reached
   - Handling: Show toast "Hệ thống đang bận. Vui lòng thử lại sau"
   - Recovery: Use cached data if available, disable write operations

4. **Document Not Found (404)**
   - Cause: Document deleted by another user or doesn't exist
   - Handling: Show toast "Tài liệu không tồn tại hoặc đã bị xóa"
   - Recovery: Remove document from local state, refresh list

**Error Handling Implementation**:
```typescript
const handleFirestoreError = (error: any, operation: string) => {
  console.error(`Firestore ${operation} error:`, error);
  
  if (error.code === 'permission-denied') {
    toast.error('Bạn không có quyền thực hiện thao tác này');
    return;
  }
  
  if (error.code === 'unavailable' || error.message.includes('network')) {
    toast.error('Không thể kết nối. Vui lòng kiểm tra mạng');
    // Implement retry logic
    return;
  }
  
  if (error.code === 'resource-exhausted') {
    toast.error('Hệ thống đang bận. Vui lòng thử lại sau');
    quotaManager.setQuotaExceeded();
    return;
  }
  
  if (error.code === 'not-found') {
    toast.error('Tài liệu không tồn tại hoặc đã bị xóa');
    return;
  }
  
  // Generic error
  toast.error('Đã xảy ra lỗi. Vui lòng thử lại');
};
```

### URL Security Errors

**Untrusted Domain Warning**:
```typescript
const checkURLSecurity = (url: string): URLSecurityResult => {
  const validation = validateURL(url);
  
  if (!validation.isValid) {
    return {
      canProceed: false,
      warning: 'URL không hợp lệ'
    };
  }
  
  if (!validation.isTrusted) {
    return {
      canProceed: true,
      warning: 'URL này chưa được xác minh. Vui lòng kiểm tra kỹ trước khi truy cập'
    };
  }
  
  return {
    canProceed: true,
    warning: null
  };
};
```

**XSS Prevention**:
```typescript
const sanitizeURL = (url: string): string => {
  // Encode special characters to prevent XSS
  return url
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/`/g, '%60');
};
```

### Empty State Handling

**No Documents Found**:
```typescript
if (documents.length === 0 && !loading) {
  return (
    <div className="text-center py-12">
      <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
      <p className="text-gray-600 dark:text-gray-400 text-lg">
        Không tìm thấy tài liệu phù hợp
      </p>
      <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
        Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm
      </p>
    </div>
  );
}
```

**No Results After Search**:
```typescript
if (documents.length === 0 && searchKeyword) {
  return (
    <div className="text-center py-12">
      <Search className="w-16 h-16 mx-auto text-gray-400 mb-4" />
      <p className="text-gray-600 dark:text-gray-400 text-lg">
        Không tìm thấy kết quả cho "{searchKeyword}"
      </p>
      <button
        onClick={() => setSearchKeyword('')}
        className="mt-4 text-indigo-600 hover:text-indigo-700"
      >
        Xóa tìm kiếm
      </button>
    </div>
  );
}
```

## Testing Strategy

### Dual Testing Approach

The Academic Document Repository will use both unit tests and property-based tests for comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and integration points
- Form validation with specific invalid inputs
- Modal open/close behavior
- Toast notification display
- Empty state rendering
- Error message display

**Property-Based Tests**: Verify universal properties across all inputs
- URL validation with randomly generated URLs
- Title/description length validation with random strings
- Filter logic with random document sets
- Search functionality with random keywords
- CRUD operations with random document data

### Property-Based Testing Configuration

**Library**: `fast-check` (JavaScript/TypeScript property-based testing library)

**Configuration**:
```typescript
import fc from 'fast-check';

// Configure all property tests to run minimum 100 iterations
fc.configureGlobal({
  numRuns: 100,
  verbose: true
});
```

**Test Tagging Format**:
```typescript
describe('Academic Document Repository - Property Tests', () => {
  it('Property 1: URL Format Validation - Feature: academic-document-repository', () => {
    // Test implementation
  });
  
  it('Property 7: Major Filter Accuracy - Feature: academic-document-repository', () => {
    // Test implementation
  });
});
```

### Property Test Examples

**Property 1: URL Format Validation**
```typescript
it('Property 1: URL Format Validation - Feature: academic-document-repository', () => {
  fc.assert(
    fc.property(
      fc.webUrl(), // Generate random valid URLs
      (url) => {
        const validation = validateURL(url);
        // Valid URLs starting with http:// or https:// should pass
        if (url.startsWith('http://') || url.startsWith('https://')) {
          expect(validation.isValid).toBe(true);
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property 3: Title Length Validation**
```typescript
it('Property 3: Title Length Validation - Feature: academic-document-repository', () => {
  fc.assert(
    fc.property(
      fc.string(), // Generate random strings
      (title) => {
        const errors = validateDocumentForm({ 
          title, 
          major_id: 'cntt',
          subject: 'Test',
          category: 'Test',
          url: 'https://example.com',
          description: ''
        });
        
        const titleError = errors.find(e => e.field === 'title');
        
        // Titles < 3 chars should have error
        if (title.trim().length < 3) {
          expect(titleError).toBeDefined();
        }
        
        // Titles > 200 chars should have error
        if (title.length > 200) {
          expect(titleError).toBeDefined();
        }
        
        // Titles 3-200 chars should have no error
        if (title.trim().length >= 3 && title.length <= 200) {
          expect(titleError).toBeUndefined();
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property 7: Major Filter Accuracy**
```typescript
it('Property 7: Major Filter Accuracy - Feature: academic-document-repository', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({
        id: fc.uuid(),
        title: fc.string({ minLength: 3, maxLength: 200 }),
        major_id: fc.constantFrom('cntt', 'kinh-te', 'luat', 'su-pham'),
        subject: fc.string(),
        category: fc.string(),
        url: fc.webUrl(),
        description: fc.string({ maxLength: 500 }),
        createdAt: fc.date(),
        createdBy: fc.uuid()
      })), // Generate random document arrays
      fc.constantFrom('cntt', 'kinh-te', 'luat', 'su-pham'), // Random major filter
      (documents, selectedMajor) => {
        const filtered = filterByMajor(documents, selectedMajor);
        
        // All filtered documents must have matching major_id
        filtered.forEach(doc => {
          expect(doc.major_id).toBe(selectedMajor);
        });
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property 13: Case-Insensitive Keyword Search**
```typescript
it('Property 13: Case-Insensitive Keyword Search - Feature: academic-document-repository', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({
        id: fc.uuid(),
        title: fc.string({ minLength: 3, maxLength: 200 }),
        major_id: fc.string(),
        subject: fc.string(),
        category: fc.string(),
        url: fc.webUrl(),
        description: fc.string(),
        createdAt: fc.date(),
        createdBy: fc.uuid()
      })),
      fc.string({ minLength: 1, maxLength: 20 }), // Random search keyword
      (documents, keyword) => {
        const results = searchDocuments(documents, keyword);
        
        // All results must contain keyword (case-insensitive)
        results.forEach(doc => {
          expect(
            doc.title.toLowerCase().includes(keyword.toLowerCase())
          ).toBe(true);
        });
      }
    ),
    { numRuns: 100 }
  );
});
```

**Property 19: Document Creation Persistence**
```typescript
it('Property 19: Document Creation Persistence - Feature: academic-document-repository', () => {
  fc.assert(
    fc.asyncProperty(
      fc.record({
        title: fc.string({ minLength: 3, maxLength: 200 }),
        major_id: fc.constantFrom('cntt', 'kinh-te', 'luat'),
        subject: fc.string({ minLength: 1, maxLength: 100 }),
        category: fc.constantFrom('Đề thi', 'Slide bài giảng', 'Sách PDF'),
        url: fc.webUrl(),
        description: fc.string({ maxLength: 500 })
      }),
      async (formData) => {
        // Create document
        const docId = await createDocument(formData, 'test-user-uid');
        
        // Verify document exists in Firestore
        const docSnap = await getDoc(doc(db, 'documentLinks', docId));
        expect(docSnap.exists()).toBe(true);
        
        // Verify all fields match
        const data = docSnap.data();
        expect(data.title).toBe(formData.title);
        expect(data.major_id).toBe(formData.major_id);
        expect(data.subject).toBe(formData.subject);
        expect(data.category).toBe(formData.category);
        expect(data.url).toBe(formData.url);
        expect(data.description).toBe(formData.description);
        expect(data.createdBy).toBe('test-user-uid');
        
        // Cleanup
        await deleteDoc(doc(db, 'documentLinks', docId));
      }
    ),
    { numRuns: 100 }
  );
});
```

### Unit Test Examples

**Example: Empty Search Shows Filtered Results**
```typescript
describe('Search Functionality', () => {
  it('should show all filtered documents when search is empty', () => {
    const documents = [
      { id: '1', title: 'Doc 1', major_id: 'cntt', subject: 'C++', category: 'Đề thi' },
      { id: '2', title: 'Doc 2', major_id: 'cntt', subject: 'Java', category: 'Đề thi' },
      { id: '3', title: 'Doc 3', major_id: 'kinh-te', subject: 'Kinh tế', category: 'Sách' }
    ];
    
    const filters = { major_id: 'cntt', category: null };
    const searchKeyword = '';
    
    const results = filterAndSearch(documents, filters, searchKeyword);
    
    // Should return all CNTT documents
    expect(results).toHaveLength(2);
    expect(results.every(doc => doc.major_id === 'cntt')).toBe(true);
  });
});
```

**Example: Modal Display on Button Click**
```typescript
describe('Create Document Modal', () => {
  it('should open modal when "Thêm tài liệu" button is clicked', () => {
    const { getByText, getByRole } = render(<DocumentRepository currentUser={mockUser} />);
    
    const addButton = getByText('Thêm tài liệu');
    fireEvent.click(addButton);
    
    // Modal should be visible
    const modal = getByRole('dialog');
    expect(modal).toBeInTheDocument();
    
    // Form fields should be present
    expect(getByLabelText('Tiêu đề')).toBeInTheDocument();
    expect(getByLabelText('Ngành học')).toBeInTheDocument();
    expect(getByLabelText('Loại tài liệu')).toBeInTheDocument();
  });
});
```

**Example: Confirmation Dialog on Delete**
```typescript
describe('Document Deletion', () => {
  it('should show confirmation dialog when delete button is clicked', () => {
    const mockDocument = {
      id: 'test-doc',
      title: 'Test Document',
      createdBy: 'user-123',
      // ... other fields
    };
    
    const mockUser = { uid: 'user-123' };
    
    window.confirm = jest.fn(() => false); // Mock confirmation dialog
    
    const { getByTitle } = render(
      <DocumentCard document={mockDocument} currentUser={mockUser} />
    );
    
    const deleteButton = getByTitle('Xóa');
    fireEvent.click(deleteButton);
    
    // Confirmation should be called
    expect(window.confirm).toHaveBeenCalledWith('Bạn có chắc muốn xóa tài liệu này?');
  });
});
```

### Test Coverage Goals

- **Unit Tests**: 80% code coverage minimum
- **Property Tests**: 100% coverage of all correctness properties
- **Integration Tests**: Cover all Firestore CRUD operations
- **E2E Tests**: Cover critical user flows (create, search, filter, delete)

### Continuous Integration

All tests must pass before merging to main branch:
```yaml
# .github/workflows/test.yml
name: Test Academic Document Repository
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run test:unit
      - run: npm run test:property
      - run: npm run test:integration
```
