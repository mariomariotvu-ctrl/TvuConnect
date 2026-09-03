# Design Document: Document Repository UI Enhancement

## Overview

The Document Repository UI Enhancement is a comprehensive redesign of the Academic Document Repository interface to provide a modern, visually appealing, and user-friendly experience. This enhancement focuses on improving the DocumentCard component with better visual design, displaying uploader information with avatars, implementing proper permission controls, and ensuring responsive design across all devices.

### Key Design Goals

1. **Modern Visual Design**: Implement contemporary UI patterns with improved spacing, shadows, and hover effects
2. **User Attribution**: Display uploader information (name and avatar) on each document card
3. **Permission Control**: Ensure only document owners can edit/delete their documents
4. **Responsive Excellence**: Optimize for mobile, tablet, and desktop with appropriate layouts
5. **Performance**: Maintain fast load times through caching and lazy loading strategies
6. **Accessibility**: Ensure WCAG AA compliance for all users

### Design Principles

- **Progressive Enhancement**: Start with functional base, enhance with visual polish
- **Mobile-First**: Design for mobile constraints, scale up for larger screens
- **Performance Budget**: Keep initial load under 2 seconds on 3G networks
- **Accessibility First**: Build with semantic HTML and ARIA from the start

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DocumentRepository                        │
│  - Manages state (filters, search, modals)                  │
│  - Orchestrates data fetching                                │
│  - Handles CRUD operations                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├──────────────┬──────────────┬──────────────┐
                 │              │              │              │
         ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐ ┌────▼─────┐
         │  SearchBar   │ │  Filter  │ │  Document   │ │  Modals  │
         │              │ │  Panel   │ │    Grid     │ │          │
         └──────────────┘ └──────────┘ └──────┬──────┘ └──────────┘
                                               │
                                       ┌───────▼────────┐
                                       │ DocumentCard   │
                                       │ (Enhanced)     │
                                       └───────┬────────┘
                                               │
                                    ┌──────────┴──────────┐
                                    │                     │
                            ┌───────▼────────┐   ┌───────▼────────┐
                            │ UploaderInfo   │   │ ActionButtons  │
                            │ Component      │   │ (Conditional)  │
                            └────────────────┘   └────────────────┘
```

### Data Flow

```
User Action → DocumentRepository → useDocuments Hook → Firestore
                    ↓
            DocumentGrid (renders cards)
                    ↓
            DocumentCard (fetches uploader data)
                    ↓
            UploaderInfo (displays avatar + name)
```

### Component Hierarchy

```
DocumentRepository
├── SearchBar
├── FilterPanel
├── DocumentGrid
│   └── DocumentCard (enhanced)
│       ├── UploaderInfo
│       │   ├── Avatar (with lazy loading)
│       │   └── DisplayName
│       └── ActionButtons (conditional rendering)
│           ├── EditButton (owner only)
│           └── DeleteButton (owner only)
├── CreateDocumentModal
└── EditDocumentModal
```

## Components and Interfaces

### 1. Enhanced DocumentCard Component

The DocumentCard is the primary component being enhanced in this design.

#### Props Interface

```typescript
interface DocumentCardProps {
  document: DocumentLink;
  currentUser: User;
  onEdit: (document: DocumentLink) => void;
  onDelete: (id: string) => void;
  onProfileClick?: (uid: string) => void;
}
```

#### Internal State

```typescript
interface DocumentCardState {
  uploaderProfile: UserProfile | null;
  avatarLoading: boolean;
  avatarError: boolean;
}
```

#### Visual Specifications

- **Border Radius**: 12px (mobile), 16px (desktop)
- **Shadow**: `0 2px 8px rgba(0,0,0,0.1)` default, `0 8px 24px rgba(0,0,0,0.15)` on hover
- **Padding**: 16px (mobile), 20px (desktop)
- **Hover Scale**: 102% with 200ms transition
- **Gap between sections**: 12px

### 2. UploaderInfo Component (New)

A new component to display uploader information at the bottom of each card.

#### Props Interface

```typescript
interface UploaderInfoProps {
  uploaderId: string;
  onProfileClick?: (uid: string) => void;
  iconSize?: 'sm' | 'md'; // sm: 16px, md: 18px
  showIcon?: boolean; // default: true
  className?: string;
}
```

#### Layout

```
┌────────────────────────────────────────────────┐
│  [Icon]  Đăng bởi:  Display Name               │
│   16px   ↑ 8px gap  ↑ 6px gap                  │
│  gray-500  gray-500  gray-700                  │
│           font-600   font-600                  │
└────────────────────────────────────────────────┘
```

#### Visual Specifications

- **Icon size**: 16px when text is 14px, 18px when text is 16px
- **Icon color**: gray-500 (light mode), gray-400 (dark mode) - matching label color
- **Spacing**: gap-2 (8px) between icon-label, gap-1.5 (6px) between label-username
- **Font-weight**: 600 (semibold) for both "Đăng bởi" label and username
- **Vertical alignment**: items-center (flexbox)
- **Padding-y**: 2px for container
- **Color contrast**: Minimum 4.5:1 ratio for WCAG AA compliance

#### Fallback Behavior

```typescript
function getDisplayName(profile: UserProfile): string {
  if (profile.displayName) return profile.displayName;
  if (profile.username) return profile.username;
  return "Người dùng không xác định";
}
```

#### Implementation Example

```typescript
export function UploaderInfo({ uploaderId, onProfileClick, iconSize = 'sm', showIcon = true, className }: UploaderInfoProps) {
  const { profile, loading } = useUploaderProfile(uploaderId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <User className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 animate-pulse" strokeWidth={2} />
        <span className="text-sm font-semibold text-gray-400 dark:text-gray-500">
          Đang tải...
        </span>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  // Dynamic display name fallback
  const displayName = profile.displayName || profile.username || "Người dùng không xác định";
  
  // Truncate if longer than 20 characters
  const truncatedName = displayName.length > 20
    ? displayName.substring(0, 20) + '...'
    : displayName;

  const iconSizeClass = iconSize === 'md' ? 'w-[18px] h-[18px]' : 'w-4 h-4';

  return (
    <div className={`flex items-center gap-2 py-0.5 ${className || ''}`}>
      {showIcon && (
        <User 
          className={`${iconSizeClass} text-gray-500 dark:text-gray-400 flex-shrink-0`} 
          strokeWidth={2} 
          aria-hidden="true"
        />
      )}
      <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0">
        Đăng bởi:
      </span>
      <button
        onClick={onProfileClick ? () => onProfileClick(uploaderId) : undefined}
        className={`text-sm font-semibold text-gray-700 dark:text-gray-300 truncate ${
          onProfileClick ? 'hover:underline hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer' : ''
        }`}
        disabled={!onProfileClick}
        aria-label={`Xem hồ sơ của ${displayName}`}
        title={displayName}
      >
        {truncatedName}
      </button>
    </div>
  );
}
```

#### Avatar Specifications

- **Size**: 32px (mobile), 40px (desktop)
- **Border**: 2px solid with theme-aware color
- **Border Radius**: 50% (circular)
- **Default Avatar**: First letter of display name on colored background
- **Loading State**: Skeleton circle with shimmer animation

### 3. Avatar Component (New)

Reusable avatar component with lazy loading and error handling.

#### Props Interface

```typescript
interface AvatarProps {
  src?: string;
  alt: string;
  size: 'sm' | 'md' | 'lg'; // 32px, 40px, 48px
  fallbackText: string; // First letter for default avatar
  onClick?: () => void;
  className?: string;
}
```

#### Features

- Lazy loading using Intersection Observer
- Error handling with fallback to default avatar
- Hover effects when clickable
- Accessible with proper alt text

### 4. useUploaderProfile Hook (New)

Custom hook for fetching and caching uploader profile data.

#### Interface

```typescript
function useUploaderProfile(uploaderId: string): {
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
}
```

#### Caching Strategy

- **In-Memory Cache**: Map<string, CachedProfile>
- **TTL**: 5 minutes (300,000ms)
- **Cache Key**: User UID
- **Batch Fetching**: Group multiple requests within 100ms window

```typescript
interface CachedProfile {
  data: UserProfile;
  timestamp: number;
  expiresAt: number;
}
```

## Data Models

### UserProfile (from Firestore "users" collection)

```typescript
interface UserProfile {
  uid: string;
  displayName?: string; // Primary display name (optional)
  username?: string; // Fallback display name (optional)
  photoURL?: string;
  email?: string;
  major?: string;
  yearOfStudy?: string;
  createdAt: Timestamp;
}

// Display name resolution logic
function resolveDisplayName(profile: UserProfile): string {
  return profile.displayName || profile.username || "Người dùng không xác định";
}
```

### DocumentLink (Enhanced)

```typescript
interface DocumentLink {
  id: string;
  title: string;
  major_id: string;
  subject: string;
  category: string;
  url: string;
  description: string;
  createdAt: Timestamp;
  createdBy: string; // User UID - used for permission checks
  updatedAt?: Timestamp;
}
```

### UploaderCache (New)

```typescript
interface UploaderCache {
  profiles: Map<string, CachedProfile>;
  pendingRequests: Map<string, Promise<UserProfile>>;
  batchQueue: string[];
  batchTimer: NodeJS.Timeout | null;
}
```

## Permission Control Logic

### Delete/Edit Button Visibility

```typescript
function shouldShowActionButtons(
  document: DocumentLink,
  currentUser: User
): boolean {
  return document.createdBy === currentUser.uid;
}
```

### Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /documentLinks/{docId} {
      // Anyone can read
      allow read: if true;
      
      // Only authenticated users can create
      allow create: if request.auth != null
                    && request.resource.data.createdBy == request.auth.uid;
      
      // Only owner can update/delete
      allow update, delete: if request.auth != null
                            && resource.data.createdBy == request.auth.uid;
    }
    
    match /users/{userId} {
      // Anyone can read user profiles (for uploader info)
      allow read: if true;
      
      // Only owner can write their profile
      allow write: if request.auth != null
                   && request.auth.uid == userId;
    }
  }
}
```

## Responsive Design Strategy

### Breakpoints

- **Mobile**: < 768px (1 column)
- **Tablet**: 768px - 1024px (2 columns)
- **Desktop**: > 1024px (3 columns)

### Layout Grid

```css
.document-grid {
  display: grid;
  gap: 16px; /* mobile */
  grid-template-columns: 1fr; /* mobile */
}

@media (min-width: 768px) {
  .document-grid {
    gap: 20px;
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .document-grid {
    gap: 24px;
    grid-template-columns: repeat(3, 1fr);
  }
}
```

### Typography Scale

| Element | Mobile | Desktop | Font-weight | Color (Light) | Color (Dark) |
|---------|--------|---------|-------------|---------------|--------------|
| Title | 16px / 600 | 18px / 600 | 600 | gray-900 | gray-100 |
| Description | 14px / 400 | 14px / 400 | 400 | gray-600 | gray-400 |
| Tags | 12px / 500 | 12px / 500 | 500 | varies | varies |
| Uploader Name | 13px / 500 | 14px / 500 | 600 | gray-700 | gray-300 |
| Label | 12px / 400 | 13px / 400 | 600 | gray-500 | gray-400 |
| Uploader Icon | 16px | 16px | - | gray-500 | gray-400 |

### Touch Targets

All interactive elements on mobile must meet minimum 44px height for accessibility.

## Dark Mode Implementation

### Color Tokens

```typescript
const colorTokens = {
  card: {
    light: 'bg-white',
    dark: 'bg-gray-800'
  },
  cardBorder: {
    light: 'border-gray-200',
    dark: 'border-gray-700'
  },
  text: {
    primary: {
      light: 'text-gray-900',
      dark: 'text-gray-100'
    },
    secondary: {
      light: 'text-gray-600',
      dark: 'text-gray-400'
    }
  },
  shadow: {
    light: 'shadow-md hover:shadow-lg',
    dark: 'shadow-gray-900/30 hover:shadow-gray-900/50'
  },
  avatarBorder: {
    light: 'border-gray-300',
    dark: 'border-gray-600'
  },
  uploaderInfo: {
    icon: {
      light: 'text-gray-500',
      dark: 'text-gray-400'
    },
    label: {
      light: 'text-gray-500',
      dark: 'text-gray-400'
    },
    username: {
      light: 'text-gray-700',
      dark: 'text-gray-300'
    }
  }
};
```

### Tag Colors (Dark Mode Adjusted)

```typescript
const tagColors = {
  major: {
    light: 'bg-blue-100 text-blue-700',
    dark: 'bg-blue-900/50 text-blue-300'
  },
  subject: {
    light: 'bg-green-100 text-green-700',
    dark: 'bg-green-900/50 text-green-300'
  },
  category: {
    light: 'bg-purple-100 text-purple-700',
    dark: 'bg-purple-900/50 text-purple-300'
  }
};
```

## Performance Optimizations

### 1. React.memo for DocumentCard

```typescript
export const DocumentCard = React.memo(
  DocumentCardComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.document.id === nextProps.document.id &&
      prevProps.document.updatedAt === nextProps.document.updatedAt &&
      prevProps.currentUser.uid === nextProps.currentUser.uid
    );
  }
);
```

### 2. Avatar Lazy Loading

```typescript
function useIntersectionObserver(
  ref: RefObject<HTMLElement>,
  options: IntersectionObserverInit
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);
  
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);
    
    if (ref.current) {
      observer.observe(ref.current);
    }
    
    return () => observer.disconnect();
  }, [ref, options]);
  
  return isIntersecting;
}
```

### 3. Batch Uploader Data Fetching

```typescript
class UploaderDataBatcher {
  private queue: Set<string> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 100; // ms
  
  add(uploaderId: string): Promise<UserProfile> {
    this.queue.add(uploaderId);
    
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.BATCH_DELAY);
    }
    
    return this.getPendingPromise(uploaderId);
  }
  
  private async flush(): Promise<void> {
    const ids = Array.from(this.queue);
    this.queue.clear();
    this.timer = null;
    
    // Fetch all profiles in one query
    const profiles = await fetchMultipleProfiles(ids);
    
    // Resolve all pending promises
    ids.forEach(id => {
      this.resolvePending(id, profiles[id]);
    });
  }
}
```

### 4. Virtualization for Large Lists

For lists with more than 50 documents, implement virtual scrolling using `react-window`:

```typescript
import { FixedSizeGrid } from 'react-window';

function VirtualizedDocumentGrid({ documents, ...props }) {
  const columnCount = useResponsiveColumns(); // 1, 2, or 3
  const rowCount = Math.ceil(documents.length / columnCount);
  
  return (
    <FixedSizeGrid
      columnCount={columnCount}
      columnWidth={350}
      height={800}
      rowCount={rowCount}
      rowHeight={280}
      width={1200}
    >
      {({ columnIndex, rowIndex, style }) => (
        <div style={style}>
          <DocumentCard document={documents[rowIndex * columnCount + columnIndex]} />
        </div>
      )}
    </FixedSizeGrid>
  );
}
```

## Accessibility Implementation

### Semantic HTML Structure

```html
<article class="document-card" aria-label="Document: {title}">
  <header>
    <h3>{title}</h3>
  </header>
  
  <div class="tags" role="list">
    <span role="listitem" aria-label="Major: {major}">{major}</span>
    <span role="listitem" aria-label="Subject: {subject}">{subject}</span>
    <span role="listitem" aria-label="Category: {category}">{category}</span>
  </div>
  
  <p class="description">{description}</p>
  
  <footer class="uploader-info" role="group" aria-label="Thông tin người đăng">
    <svg aria-hidden="true" class="icon">...</svg>
    <span class="label">Đăng bởi:</span>
    <button 
      aria-label="Xem hồ sơ của {displayName}"
      onClick={handleProfileClick}
    >
      {displayName}
    </button>
  </footer>
  
  <div class="actions" role="group" aria-label="Document actions">
    <button aria-label="Open document in new tab">
      Mở tài liệu
    </button>
    {isOwner && (
      <>
        <button aria-label="Edit document">Edit</button>
        <button aria-label="Delete document">Delete</button>
      </>
    )}
  </div>
</article>
```

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Focus indicators must be visible (2px outline)
- Tab order must be logical (top to bottom, left to right)
- Escape key closes modals

### Screen Reader Support

- Use aria-label for icon-only buttons
- Announce loading states with aria-live regions
- Provide text alternatives for all visual information

### Color Contrast

All text must meet WCAG AA standards:
- Normal text: 4.5:1 contrast ratio
- Large text (18px+): 3:1 contrast ratio
- Interactive elements: 3:1 contrast ratio

## Loading States and Skeletons

### Skeleton Card Structure

```typescript
function SkeletonCard() {
  return (
    <div className="skeleton-card animate-pulse">
      {/* Title skeleton */}
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
      
      {/* Tags skeleton */}
      <div className="flex gap-2 mb-3">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20" />
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-24" />
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16" />
      </div>
      
      {/* Description skeleton */}
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6" />
      </div>
      
      {/* Uploader info skeleton */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
      </div>
      
      {/* Button skeleton */}
      <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-full" />
    </div>
  );
}
```

### Shimmer Animation

```css
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.skeleton-card {
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.5),
    transparent
  );
  background-size: 1000px 100%;
  animation: shimmer 2s infinite;
}
```

### Minimum Display Time

To prevent flashing, skeletons must display for at least 300ms:

```typescript
function useMinimumLoadingTime(isLoading: boolean, minTime: number = 300) {
  const [showLoading, setShowLoading] = useState(isLoading);
  const loadingStartTime = useRef<number | null>(null);
  
  useEffect(() => {
    if (isLoading) {
      loadingStartTime.current = Date.now();
      setShowLoading(true);
    } else if (loadingStartTime.current) {
      const elapsed = Date.now() - loadingStartTime.current;
      const remaining = Math.max(0, minTime - elapsed);
      
      setTimeout(() => {
        setShowLoading(false);
        loadingStartTime.current = null;
      }, remaining);
    }
  }, [isLoading, minTime]);
  
  return showLoading;
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following testable properties. During reflection, I found several redundancies:

- **Redundant**: 3.2 is the inverse of 3.1 (both test button visibility based on ownership)
- **Redundant**: 9.2 is identical to 6.2 (skeleton display while loading)
- **Redundant**: 11.7 is covered by 11.1 and 11.2 (passing UID to callback)
- **Redundant**: 12.4 is identical to 6.4 (lazy loading avatars)
- **Redundant**: 12.5 is identical to 6.5 (batching Firestore queries)

After removing redundancies, here are the unique, testable properties:

### Property 1: Uploader Display Name Rendering

*For any* document card with an uploader profile, the rendered output should contain the uploader's display name.

**Validates: Requirements 2.1**

### Property 2: Avatar Image Display

*For any* uploader profile with a photoURL, the rendered document card should include an img element with that photoURL as the src attribute.

**Validates: Requirements 2.3**

### Property 3: Default Avatar Fallback

*For any* uploader profile without a photoURL, the rendered document card should display a default avatar containing the first letter of the uploader's display name.

**Validates: Requirements 2.4**

### Property 4: Uploader Data Fetching

*For any* document with a createdBy UID, fetching uploader information should query the Firestore "users" collection using that exact UID.

**Validates: Requirements 2.5**

### Property 5: Uploader Label Display

*For any* document card, the rendered output should contain the label "Đăng bởi" immediately before the uploader's display name.

**Validates: Requirements 2.6**

### Property 6: Display Name Truncation

*For any* uploader display name longer than 20 characters, the rendered output should truncate the name and include an ellipsis indicator.

**Validates: Requirements 2.7**

### Property 6a: Dynamic Display Name Fallback

*For any* user profile, the displayed name should be display_name if available, otherwise username, otherwise "Người dùng không xác định".

**Validates: Requirements 2.8, 2.9, 2.10**

### Property 7: Owner-Only Action Buttons

*For any* document and current user, the delete button and edit button should be visible in the rendered card if and only if the current user's UID matches the document's createdBy field.

**Validates: Requirements 3.1, 3.4**

### Property 8: Unauthorized Deletion Prevention

*For any* document where the current user's UID does not match the document's createdBy field, attempting to delete the document should result in an error with the message "Bạn không có quyền xóa tài liệu này".

**Validates: Requirements 3.3**

### Property 9: Profile Cache TTL

*For any* uploader profile fetched from Firestore, if the same profile is requested again within 5 minutes (300,000ms), it should be retrieved from cache without making a new Firestore read.

**Validates: Requirements 6.1**

### Property 10: Avatar Loading Skeleton

*For any* document card while uploader data is being fetched, a loading skeleton should be displayed in place of the avatar.

**Validates: Requirements 6.2**

### Property 11: Avatar Load Failure Fallback

*For any* avatar image that fails to load (404, network error, etc.), the document card should display the default avatar with the first letter of the uploader's display name.

**Validates: Requirements 6.3**

### Property 12: Avatar Lazy Loading

*For any* document card that is not currently visible in the viewport, the avatar image should not be loaded until the card enters the viewport (using Intersection Observer).

**Validates: Requirements 6.4**

### Property 13: Batch Profile Fetching

*For any* set of documents with multiple unique uploaders, the system should batch profile fetch requests to minimize the number of Firestore reads (ideally one query for all unique UIDs).

**Validates: Requirements 6.5**

### Property 14: Profile Cache Reuse

*For any* uploader who appears in multiple documents, their profile data should be fetched only once and reused across all cards displaying their documents.

**Validates: Requirements 6.6**

### Property 15: Button Accessibility Labels

*For any* interactive button in the document card, the rendered HTML should include an aria-label attribute describing the button's action.

**Validates: Requirements 8.1**

### Property 16: Semantic HTML Structure

*For any* document card, the rendered HTML should use semantic elements including <article> for the card container, and appropriate heading tags for the title.

**Validates: Requirements 8.2**

### Property 17: Image Alt Text

*For any* image element in the document card (avatar, icons, etc.), the rendered HTML should include an alt attribute with descriptive text.

**Validates: Requirements 8.3**

### Property 18: Icon Button Text Alternatives

*For any* icon-only button in the document card, the rendered HTML should include either an aria-label attribute or a title attribute providing a text description.

**Validates: Requirements 8.6**

### Property 19: Loading Skeleton Display

*For any* document repository in a loading state, skeleton cards should be rendered in place of actual document cards.

**Validates: Requirements 9.1**

### Property 20: Minimum Skeleton Display Time

*For any* loading operation that completes in less than 300ms, the skeleton loading state should still be displayed for a total of 300ms to prevent flashing.

**Validates: Requirements 9.5**

### Property 21: Error State Display

*For any* document repository that encounters a loading error, the rendered output should include an error message and a retry button.

**Validates: Requirements 9.6**

### Property 22: Avatar Click Navigation

*For any* document card with an onProfileClick callback, clicking the avatar should invoke the callback with the uploader's UID as the argument.

**Validates: Requirements 11.1**

### Property 23: Display Name Click Navigation

*For any* document card with an onProfileClick callback, clicking the uploader's display name should invoke the callback with the uploader's UID as the argument.

**Validates: Requirements 11.2**

### Property 24: Memoization Prevents Re-renders

*For any* document card component, when the document data, currentUser, and callback props remain unchanged between renders, the component should not re-render (verified through React.memo).

**Validates: Requirements 12.2**

### Property 25: Icon Size Consistency

*For any* UploaderInfo component with text font-size of 14px, the icon size should be 16px.

**Validates: Requirements 14.8, 19.1, 19.2**

### Property 26: Icon Color Consistency

*For any* UploaderInfo component, the icon color should match the label color (gray-500 in light mode, gray-400 in dark mode).

**Validates: Requirements 14.9, 19.3, 19.11, 19.12**

### Property 27: Spacing Consistency

*For any* UploaderInfo component, the gap between icon and label should be 8px (gap-2), and the gap between label and username should be 6px (gap-1.5).

**Validates: Requirements 19.4, 19.5**

### Property 28: Font-weight Balance

*For any* UploaderInfo component, both the "Đăng bởi" label and username should use font-weight of 600 (semibold).

**Validates: Requirements 14.7, 14.8, 19.7, 19.8**

### Property 29: Vertical Alignment

*For any* UploaderInfo component, the icon, label, and username should be vertically center-aligned using flexbox items-center.

**Validates: Requirements 14.13, 19.6**

### Property 30: Color Contrast Compliance

*For any* UploaderInfo component, the "Đăng bởi" label should have a color contrast ratio of at least 4.5:1 against the background for WCAG AA compliance.

**Validates: Requirements 14.11, 19.9**

## Error Handling

### Client-Side Error Handling

#### 1. Uploader Profile Fetch Errors

```typescript
async function fetchUploaderProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    
    if (!userDoc.exists()) {
      console.warn(`User profile not found for UID: ${uid}`);
      return {
        uid,
        displayName: 'Người dùng không xác định',
        photoURL: undefined
      };
    }
    
    return userDoc.data() as UserProfile;
  } catch (error) {
    console.error('Error fetching uploader profile:', error);
    
    // Return fallback profile
    return {
      uid,
      displayName: 'Người dùng',
      photoURL: undefined
    };
  }
}
```

#### 2. Avatar Image Load Errors

```typescript
function Avatar({ src, alt, fallbackText }: AvatarProps) {
  const [error, setError] = useState(false);
  
  const handleError = () => {
    setError(true);
  };
  
  if (error || !src) {
    return (
      <div className="avatar-fallback">
        {fallbackText.charAt(0).toUpperCase()}
      </div>
    );
  }
  
  return (
    <img 
      src={src} 
      alt={alt} 
      onError={handleError}
      loading="lazy"
    />
  );
}
```

#### 3. Permission Errors

```typescript
async function handleDelete(documentId: string, currentUserId: string) {
  try {
    // Client-side check
    const doc = documents.find(d => d.id === documentId);
    if (doc && doc.createdBy !== currentUserId) {
      toast.error('Bạn không có quyền xóa tài liệu này');
      return;
    }
    
    // Attempt deletion
    await deleteDocument(documentId);
    toast.success('Đã xóa tài liệu');
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      toast.error('Bạn không có quyền xóa tài liệu này');
    } else {
      toast.error('Đã xảy ra lỗi khi xóa tài liệu');
    }
  }
}
```

#### 4. Cache Errors

```typescript
function getCachedProfile(uid: string): CachedProfile | null {
  try {
    const cached = profileCache.get(uid);
    
    if (!cached) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > cached.expiresAt) {
      profileCache.delete(uid);
      return null;
    }
    
    return cached;
  } catch (error) {
    console.error('Cache read error:', error);
    // Clear corrupted cache
    profileCache.clear();
    return null;
  }
}
```

### Error Recovery Strategies

1. **Graceful Degradation**: Show fallback UI when data is unavailable
2. **Retry Logic**: Provide retry buttons for failed operations
3. **User Feedback**: Display clear error messages with actionable guidance
4. **Logging**: Log errors to console for debugging (production: send to error tracking service)

### Error Boundaries

Wrap the DocumentRepository component in an error boundary to catch rendering errors:

```typescript
class DocumentRepositoryErrorBoundary extends React.Component {
  state = { hasError: false };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('DocumentRepository error:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <h2>Đã xảy ra lỗi</h2>
          <p>Không thể tải kho tài liệu. Vui lòng thử lại sau.</p>
          <button onClick={() => window.location.reload()}>
            Tải lại trang
          </button>
        </div>
      );
    }
    
    return this.props.children;
  }
}
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests to ensure comprehensive coverage:

- **Unit Tests**: Verify specific examples, edge cases, and error conditions
- **Property Tests**: Verify universal properties across all inputs

Both testing approaches are complementary and necessary. Unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across a wide range of inputs.

### Property-Based Testing

We will use **fast-check** (for TypeScript/JavaScript) as our property-based testing library. Each property test must:

- Run a minimum of 100 iterations
- Reference the design document property it validates
- Use the tag format: `Feature: document-repository-ui-enhancement, Property {number}: {property_text}`

#### Example Property Test

```typescript
import fc from 'fast-check';
import { render } from '@testing-library/react';
import { DocumentCard } from './DocumentCard';

describe('Feature: document-repository-ui-enhancement', () => {
  test('Property 1: Uploader Display Name Rendering', () => {
    fc.assert(
      fc.property(
        fc.record({
          uid: fc.uuid(),
          displayName: fc.string({ minLength: 1, maxLength: 50 }),
          photoURL: fc.option(fc.webUrl(), { nil: undefined })
        }),
        fc.record({
          id: fc.uuid(),
          title: fc.string({ minLength: 3, maxLength: 200 }),
          createdBy: fc.uuid(),
          // ... other document fields
        }),
        (uploaderProfile, document) => {
          const { container } = render(
            <DocumentCard
              document={document}
              currentUser={{ uid: 'test-user' }}
              onEdit={() => {}}
              onDelete={() => {}}
            />
          );
          
          // Property: rendered output should contain uploader's display name
          expect(container.textContent).toContain(uploaderProfile.displayName);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('Property 6a: Dynamic Display Name Fallback', () => {
    fc.assert(
      fc.property(
        fc.record({
          uid: fc.uuid(),
          displayName: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          username: fc.option(fc.string({ minLength: 1 }), { nil: undefined })
        }),
        (profile) => {
          const expectedName = profile.displayName || profile.username || "Người dùng không xác định";
          const { container } = render(<UploaderInfo uploaderId={profile.uid} />);
          
          // Property: displayed name follows fallback hierarchy
          expect(container.textContent).toContain(expectedName);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('Property 25: Icon Size Consistency', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('sm', 'md'),
        (iconSize) => {
          const { container } = render(
            <UploaderInfo uploaderId="test-uid" iconSize={iconSize} />
          );
          
          const icon = container.querySelector('svg');
          const expectedSize = iconSize === 'md' ? '18px' : '16px';
          
          // Property: icon size matches text size
          expect(icon?.classList.contains(iconSize === 'md' ? 'w-[18px]' : 'w-4')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('Property 27: Spacing Consistency', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (uploaderId) => {
          const { container } = render(<UploaderInfo uploaderId={uploaderId} />);
          
          const uploaderContainer = container.firstChild as HTMLElement;
          
          // Property: gap-2 (8px) between icon and label
          expect(uploaderContainer.classList.contains('gap-2')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Unit Testing Focus Areas

Unit tests should focus on:

1. **Specific Examples**: Test known edge cases (empty strings, special characters, etc.)
2. **Integration Points**: Test component interactions and callback invocations
3. **Error Conditions**: Test error handling and fallback behavior
4. **Accessibility**: Test keyboard navigation and screen reader support

#### Example Unit Tests

```typescript
describe('DocumentCard', () => {
  it('should display delete button only for document owner', () => {
    const document = createMockDocument({ createdBy: 'user-123' });
    const currentUser = { uid: 'user-123' };
    
    const { getByLabelText } = render(
      <DocumentCard
        document={document}
        currentUser={currentUser}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    
    expect(getByLabelText('Delete document')).toBeInTheDocument();
  });
  
  it('should hide delete button for non-owner', () => {
    const document = createMockDocument({ createdBy: 'user-123' });
    const currentUser = { uid: 'user-456' };
    
    const { queryByLabelText } = render(
      <DocumentCard
        document={document}
        currentUser={currentUser}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    
    expect(queryByLabelText('Delete document')).not.toBeInTheDocument();
  });
  
  it('should display fallback avatar when photoURL is missing', () => {
    const uploaderProfile = { uid: 'user-123', displayName: 'John Doe' };
    
    const { container } = render(
      <Avatar
        src={undefined}
        alt="John Doe's avatar"
        fallbackText="John Doe"
      />
    );
    
    expect(container.textContent).toBe('J');
  });
  
  it('should truncate long display names', () => {
    const longName = 'A'.repeat(30);
    const uploaderProfile = { uid: 'user-123', displayName: longName };
    
    const { container } = render(
      <UploaderInfo uploaderId="user-123" />
    );
    
    const displayedName = container.querySelector('.uploader-name')?.textContent;
    expect(displayedName?.length).toBeLessThanOrEqual(23); // 20 + '...'
  });
  
  it('should use displayName when available', () => {
    const profile = { uid: 'user-123', displayName: 'John Doe', username: 'johndoe' };
    
    const { container } = render(<UploaderInfo uploaderId="user-123" />);
    
    expect(container.textContent).toContain('John Doe');
    expect(container.textContent).not.toContain('johndoe');
  });
  
  it('should fallback to username when displayName is missing', () => {
    const profile = { uid: 'user-123', username: 'johndoe' };
    
    const { container } = render(<UploaderInfo uploaderId="user-123" />);
    
    expect(container.textContent).toContain('johndoe');
  });
  
  it('should show default text when both displayName and username are missing', () => {
    const profile = { uid: 'user-123' };
    
    const { container } = render(<UploaderInfo uploaderId="user-123" />);
    
    expect(container.textContent).toContain('Người dùng không xác định');
  });
  
  it('should use correct icon size for text size', () => {
    const { container: containerSm } = render(
      <UploaderInfo uploaderId="user-123" iconSize="sm" />
    );
    const { container: containerMd } = render(
      <UploaderInfo uploaderId="user-123" iconSize="md" />
    );
    
    const iconSm = containerSm.querySelector('svg');
    const iconMd = containerMd.querySelector('svg');
    
    expect(iconSm?.classList.contains('w-4')).toBe(true); // 16px
    expect(iconMd?.classList.contains('w-[18px]')).toBe(true); // 18px
  });
  
  it('should have correct spacing between elements', () => {
    const { container } = render(<UploaderInfo uploaderId="user-123" />);
    
    const uploaderContainer = container.firstChild as HTMLElement;
    
    expect(uploaderContainer.classList.contains('gap-2')).toBe(true); // 8px gap
  });
  
  it('should vertically center-align all elements', () => {
    const { container } = render(<UploaderInfo uploaderId="user-123" />);
    
    const uploaderContainer = container.firstChild as HTMLElement;
    
    expect(uploaderContainer.classList.contains('items-center')).toBe(true);
  });
});
```

### Test Coverage Goals

- **Line Coverage**: Minimum 80%
- **Branch Coverage**: Minimum 75%
- **Function Coverage**: Minimum 85%
- **Property Tests**: All 30 properties must have corresponding tests (24 original + 6 new properties for visual consistency)

### Testing Tools

- **Test Runner**: Vitest
- **Property Testing**: fast-check
- **Component Testing**: React Testing Library
- **Mocking**: Vitest mocks for Firestore
- **Accessibility Testing**: jest-axe

### Continuous Integration

All tests must pass before merging:

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:unit
      - run: npm run test:property
      - run: npm run test:coverage
```

