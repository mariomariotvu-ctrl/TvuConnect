# Academic Document Repository - Spec Update Summary

## Date: April 18, 2026

## Changes Made

### Overview
Updated the Academic Document Repository spec to reflect a **simplified single-filter design** based on user feedback. The system now uses only the **Major (Ngành học)** filter in the UI, removing Subject and Category filters for better user experience.

### Key Design Decisions

1. **Filter Simplification**
   - **Before**: 3 filters (Major, Subject, Category)
   - **After**: 1 filter (Major only)
   - **Rationale**: Since the platform stores many types of external links, a simpler filter system is more practical. Users can search for specific subjects or categories using the search bar.

2. **Data Model Unchanged**
   - Subject and Category fields **remain** in the DocumentLink data model
   - Subject and Category fields **remain** in the CreateDocumentModal and EditDocumentModal forms
   - These fields are stored as metadata but not used for filtering in the UI

3. **Search Enhancement**
   - Search bar now searches across **title, subject, AND category** fields
   - This allows users to find specific subjects/categories without dedicated filter dropdowns

### Files Updated

#### 1. `requirements.md`
- Removed Requirement 3 (Category Filtering)
- Updated Requirement 2 to only cover Major filtering
- Updated Requirement 4 (now Requirement 3) to include subject/category in search
- Renumbered all subsequent requirements
- Added note about simplified design in Introduction

#### 2. `design.md`
- Updated FilterState interface to only include `major_id`
- Updated FilterPanel component to show only Major dropdown
- Updated component hierarchy diagram
- Updated data flow examples
- Updated Firestore indexes to only include major_id + createdAt composite index
- Updated useDocuments hook implementation strategy
- Updated cache key generation logic

#### 3. `tasks.md`
- Updated Task 1 to clarify FilterState only has major_id
- Updated Task 6 to remove subject/category filter logic
- Updated Task 7 to update cache key based on major_id only
- Updated Task 9 to implement single-dropdown FilterPanel
- Updated Task 10 to enhance search placeholder text
- Updated Task 12 to note Subject/Category remain in form
- Updated Task 18 to only create one composite index
- Updated all requirement references throughout tasks
- Added notes about simplified design in Overview

### Implementation Impact

#### Components to Update

1. **src/types/documentLink.ts**
   ```typescript
   // BEFORE
   interface FilterState {
     major_id: string | null;
     subject: string | null;
     category: string | null;
   }
   
   // AFTER
   interface FilterState {
     major_id: string | null;  // Only major filter
   }
   ```

2. **src/components/FilterPanel.tsx**
   - Remove Subject dropdown
   - Remove Category dropdown
   - Keep only Major dropdown
   - Update grid layout from 3 columns to single/full-width
   - Update active filters display to only show major tag

3. **src/components/DocumentRepository.tsx**
   - Update initial filters state to only include major_id
   - Remove subject and category from filters state

4. **src/hooks/useDocuments.ts**
   - Update cache key generation: `docs_${filters.major_id || 'all'}`
   - Simplify cache key logic

5. **src/utils/documentFilters.ts**
   - Update buildFirestoreQuery to only filter by major_id
   - Update filterByKeyword to search title, subject, AND category
   - Remove filterBySubject and filterByCategory helper functions

6. **firestore.indexes.json**
   - Keep only: major_id + createdAt composite index
   - Remove all other composite indexes

### What Stays the Same

- DocumentLink data model (all fields remain)
- CreateDocumentModal form (includes subject & category)
- EditDocumentModal form (includes subject & category)
- DocumentCard display (shows all tags)
- Security rules
- All CRUD operations
- Theme integration
- Mobile responsive design

### Benefits of This Change

1. **Simpler UX**: One dropdown instead of three reduces cognitive load
2. **Faster Filtering**: Fewer Firestore indexes needed, simpler queries
3. **Better Performance**: Simplified cache key generation and management
4. **Flexible Search**: Users can still find specific subjects/categories via search
5. **Cleaner UI**: More space for document cards, less cluttered filter panel

### Next Steps

The spec is now complete and ready for implementation. To begin:

1. Open `tasks.md` to see the implementation plan
2. Start with Task 1 (already completed - data models)
3. Follow the sequential task order
4. Run tests after each checkpoint

### Testing Notes

- All property-based tests remain valid
- Update unit tests for FilterPanel to test single dropdown
- Update integration tests to test major-only filtering
- Add tests for enhanced search (title + subject + category)

## Conclusion

The Academic Document Repository spec has been successfully updated to reflect a simplified, user-friendly design that maintains full metadata while streamlining the filtering experience. The implementation can now proceed with clear guidance.
