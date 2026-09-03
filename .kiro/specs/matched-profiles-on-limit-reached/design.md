# Design Document — Matched Profiles On Limit Reached

## Overview

Khi người dùng TVU Connect hết lượt ghép cặp trong chu kỳ 8 tiếng (`remainingMatches === 0`), giao diện hiện tại chỉ hiển thị banner đỏ và nút bị vô hiệu hoá — để lại phần còn lại của màn hình trống. Tính năng này bổ sung một `MatchedProfilesSection` component ngay bên dưới banner, tận dụng `useMatchingHistory` hook và hạ tầng Firestore sẵn có để hiển thị danh sách hồ sơ đã ghép kèm nút "Nhắn tin" trực tiếp.

**Nguyên tắc thiết kế cốt lõi**: Chỉ thêm mới, không sửa logic cũ. `Matching.tsx` chỉ được bổ sung đoạn JSX conditional render; không có bất kỳ existing behavior nào bị thay đổi.

---

## Architecture

### Luồng dữ liệu

```mermaid
graph TD
    A[Matching.tsx] -->|useMatchingHistory| B[useMatchingHistory hook]
    B -->|Firestore real-time| C[(matches collection)]
    B -->|blockedSet filter| D[matchHistory: Match[]]
    A -->|remainingMatches === 0| E{Conditional Render}
    E -->|true| F[MatchedProfilesSection]
    E -->|false| G[null - not in DOM]
    F -->|props| H[ProfileCardItem list]
    H -->|onStartChat| I[onMatchFound callback → Chat Screen]
    A -->|independent| J[MatchingHistory existing]
```

### Vị trí trong JSX của `Matching.tsx`

```
Daily_Limit_Banner
  ↓ (new — chỉ khi remainingMatches === 0)
MatchedProfilesSection          ← Component mới
  ↓
MatchingResults (không đổi)
  ↓
MatchingHistory (không đổi)
```

### Quyết định thiết kế quan trọng

| Quyết định | Lý do |
|---|---|
| `MatchedProfilesSection` nhận toàn bộ state qua props (không tự gọi hook) | `Matching.tsx` đã gọi `useMatchingHistory` — truyền xuống tránh double subscription Firestore |
| Không dùng `isLoading` từ hook hiện có cho `MatchingHistory` | `MatchedProfilesSection` tái dùng cùng hook call, share state qua props |
| Component tách thành file riêng `MatchedProfilesSection.tsx` | Tránh làm `Matching.tsx` phình to; dễ test độc lập |
| Conditional render thuần React (không CSS display:none) | Requirement 8.2 — component phải unmount hoàn toàn khi `remainingMatches > 0` |

---

## Components and Interfaces

### 1. `MatchedProfilesSection` — Component mới

**File**: `src/components/matching/MatchedProfilesSection.tsx`

```typescript
interface MatchedProfilesSectionProps {
  matchHistory: Match[];          // Danh sách match đã lọc blocked users
  hasMoreHistory: boolean;        // Có thêm records để load không
  loadMore: () => void;           // Gọi để tải thêm 10 records
  isLoading: boolean;             // Đang fetch Firestore
  error: string | null;           // Error message hoặc null
  onStartChat: (profile: StudentProfile) => void; // Callback khi nhấn "Nhắn tin"
}
```

**Responsibilities**:
- Render header section (tiêu đề + mô tả phụ)
- Điều phối các state views: skeleton / empty / error / list
- Render danh sách `ProfileCardItem`
- Render nút "Xem thêm" khi `hasMoreHistory === true`

### 2. `ProfileCardItem` — Sub-component nội bộ trong `MatchedProfilesSection.tsx`

Không tạo file riêng — định nghĩa inline hoặc private trong cùng file.

```typescript
interface ProfileCardItemProps {
  match: Match;                                     // Match record đầy đủ
  onStartChat: (profile: StudentProfile) => void;  // Propagate up
}
```

**Trách nhiệm**:
- Hiển thị avatar (ảnh hoặc `UserIcon` fallback)
- Hiển thị `fullName`, `major` (fallback "Chưa cập nhật"), `createdAt` (format `dd/MM/yyyy`, fallback "Không rõ ngày")
- Render `Message_Button` "Nhắn tin" — min 44×44px trên mobile

### 3. Thay đổi trong `Matching.tsx`

Chỉ thêm, không sửa:

```tsx
// Destructure thêm isLoading và error từ useMatchingHistory call đã có
const { matchHistory, hasMoreHistory, loadMore, isLoading: isHistoryLoading, error: historyError } = useMatchingHistory(
  currentUser.uid,
  blockedSet,
  FIRESTORE_LIMITS.MATCH_HISTORY_INITIAL
);

// Trong JSX, sau Daily_Limit_Banner, trước MatchingResults:
{remainingMatches === 0 && (
  <MatchedProfilesSection
    matchHistory={matchHistory}
    hasMoreHistory={hasMoreHistory}
    loadMore={loadMore}
    isLoading={isHistoryLoading}
    error={historyError}
    onStartChat={onMatchFound}
  />
)}
```

> **Lưu ý**: Hook `useMatchingHistory` đã được gọi — chỉ cần destructure thêm `isLoading` và `error` từ call hiện có. Không có Firestore subscription mới nào được tạo.

---

## Data Models

Tính năng này không tạo Firestore collection mới hay thay đổi schema. Các model tái sử dụng:

### `Match` (hiện có — `src/types.ts`)

```typescript
interface Match {
  id?: string;
  userUid: string;
  matchedUid: string;
  matchedProfile?: StudentProfile | null; // null-safe đã được hook filter
  createdAt: Timestamp;
}
```

### `StudentProfile` (hiện có — `src/types.ts`)

Các fields được dùng trong `ProfileCardItem`:

| Field | Type | Fallback khi thiếu |
|---|---|---|
| `photoURL` | `string \| undefined` | Icon `UserIcon` placeholder |
| `fullName` | `string` | (required, always present) |
| `major` | `string \| undefined` | `"Chưa cập nhật"` |
| `uid` | `string` | (required, dùng làm key) |

### Date formatting

```typescript
// createdAt: Match.createdAt (Firestore Timestamp)
const formatMatchDate = (createdAt: Timestamp | null | undefined): string => {
  if (!createdAt?.toDate) return 'Không rõ ngày';
  return createdAt.toDate().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  // Output: "25/06/2025"
};
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Visibility ↔ remainingMatches condition

*For any* value of `remainingMatches`, `MatchedProfilesSection` SHALL be present in the DOM if and only if `remainingMatches === 0`. Specifically, when `remainingMatches` transitions from `0` to any positive value, the component SHALL unmount entirely.

**Validates: Requirements 1.1, 1.2, 8.1, 8.2**

---

### Property 2: Profile card count equals valid match count

*For any* `matchHistory` array passed as props, the number of `ProfileCardItem` components rendered by `MatchedProfilesSection` SHALL equal the number of items in `matchHistory` where `matchedProfile != null`.

**Validates: Requirements 1.3, 3.5**

---

### Property 3: Invalid major fields always display fallback

*For any* `Match_Record` where `matchedProfile.major` is `null`, `undefined`, or empty string (`""`), the rendered `ProfileCardItem` SHALL display the string `"Chưa cập nhật"` in the major field position.

**Validates: Requirements 3.3**

---

### Property 4: Date formatting produces valid Vietnamese date string

*For any* `Match_Record` where `createdAt` is a valid Firestore `Timestamp`, `ProfileCardItem` SHALL display the date as a string matching the pattern `dd/MM/yyyy`. If `createdAt` is `null` or `undefined`, the component SHALL display `"Không rõ ngày"`.

**Validates: Requirements 3.4**

---

### Property 5: Message button callback receives correct profile

*For any* `matchHistory` array where all items have valid `matchedProfile`, clicking the "Nhắn tin" button on the card at index `i` SHALL invoke `onStartChat` with exactly `matchHistory[i].matchedProfile`.

**Validates: Requirements 4.2, 4.3**

---

### Property 6: Load more button visibility matches hasMoreHistory

*For any* value of `hasMoreHistory`, the "Xem thêm" button SHALL be visible in the DOM if and only if `hasMoreHistory === true`.

**Validates: Requirements 6.2, 6.4**

---

## Error Handling

| Tình huống | Xử lý |
|---|---|
| `useMatchingHistory.error !== null` | Hiển thị thông báo "Không thể tải danh sách. Vui lòng thử lại." + nút "Thử lại" |
| Nhấn "Thử lại" | Gọi lại `loadMore()` (increment limit để trigger re-subscribe) hoặc dùng internal retry mechanism |
| `match.matchedProfile === null \| undefined` | Filter bởi hook; component guard thêm `if (!match.matchedProfile) return null` |
| `photoURL` load lỗi (img onError) | `onError` handler set về `UserIcon` placeholder |
| `createdAt` null/undefined | Fallback `"Không rõ ngày"` |
| `major` null/undefined/"" | Fallback `"Chưa cập nhật"` |

**Quan trọng**: Lỗi trong `MatchedProfilesSection` không được bubble lên phá `Matching.tsx`. Component tự xử lý error state nội bộ, không throw lên parent.

---

## Testing Strategy

### Unit Tests (example-based)

**File**: `src/components/matching/MatchedProfilesSection.test.tsx`

| Test case | Mô tả |
|---|---|
| Skeleton loader | `isLoading=true` → ≥3 skeleton items visible |
| Empty state | `matchHistory=[]`, `isLoading=false` → text "Chưa có hồ sơ nào được ghép" |
| Error state | `error="some error"` → error message + nút "Thử lại" visible |
| Retry button | Click "Thử lại" → `loadMore` mock được gọi |
| "Nhắn tin" label | Profile card rendered → button với text "Nhắn tin" present |
| Blocked user filter | matchHistory có 3 items nhưng 1 bị lọc bởi hook → chỉ 2 card rendered |
| Load more button click | Click "Xem thêm" → `loadMore` mock được gọi |
| Missing photoURL | `photoURL=undefined` → `UserIcon` placeholder rendered |

### Property-Based Tests

**Framework**: [fast-check](https://github.com/dubzzz/fast-check) (đã dùng trong project — xem `DocumentCard.preservation.pbt.test.tsx`)

**File**: `src/components/matching/MatchedProfilesSection.pbt.test.tsx`

**Cấu hình**: Tối thiểu 100 runs mỗi property.

#### PBT 1 — Visibility condition (Property 1)

```typescript
// Feature: matched-profiles-on-limit-reached, Property 1: Visibility ↔ remainingMatches condition
fc.assert(
  fc.property(fc.integer({ min: 0, max: 100 }), (remaining) => {
    render(<Matching ... remainingMatches={remaining} />);
    const section = screen.queryByTestId('matched-profiles-section');
    if (remaining === 0) expect(section).toBeInTheDocument();
    else expect(section).not.toBeInTheDocument();
  })
);
```

#### PBT 2 — Card count equals valid match count (Property 2)

```typescript
// Feature: matched-profiles-on-limit-reached, Property 2: Profile card count equals valid match count
fc.assert(
  fc.property(fc.array(arbitraryMatch()), (matches) => {
    const validCount = matches.filter(m => m.matchedProfile != null).length;
    render(<MatchedProfilesSection matchHistory={matches} ... />);
    const cards = screen.queryAllByTestId('profile-card-item');
    expect(cards.length).toBe(validCount);
  })
);
```

#### PBT 3 — Invalid major fallback (Property 3)

```typescript
// Feature: matched-profiles-on-limit-reached, Property 3: Invalid major fields always display fallback
fc.assert(
  fc.property(fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant('')), (major) => {
    const match = makeMatch({ major });
    render(<MatchedProfilesSection matchHistory={[match]} ... />);
    expect(screen.getByText('Chưa cập nhật')).toBeInTheDocument();
  })
);
```

#### PBT 4 — Date formatting (Property 4)

```typescript
// Feature: matched-profiles-on-limit-reached, Property 4: Date formatting produces valid Vietnamese date string
fc.assert(
  fc.property(arbitraryTimestamp(), (ts) => {
    const match = makeMatch({ createdAt: ts });
    render(<ProfileCardItem match={match} onStartChat={vi.fn()} />);
    const dateText = screen.getByTestId('match-date').textContent;
    // Pattern: dd/MM/yyyy
    expect(dateText).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  })
);
```

#### PBT 5 — Message button callback (Property 5)

```typescript
// Feature: matched-profiles-on-limit-reached, Property 5: Message button callback receives correct profile
fc.assert(
  fc.property(fc.array(arbitraryMatchWithProfile(), { minLength: 1 }), (matches) => {
    const onStartChat = vi.fn();
    render(<MatchedProfilesSection matchHistory={matches} onStartChat={onStartChat} ... />);
    const buttons = screen.getAllByRole('button', { name: /Nhắn tin/i });
    buttons.forEach((btn, i) => {
      fireEvent.click(btn);
      expect(onStartChat).toHaveBeenCalledWith(matches[i].matchedProfile);
    });
  })
);
```

#### PBT 6 — Load more visibility (Property 6)

```typescript
// Feature: matched-profiles-on-limit-reached, Property 6: Load more button visibility matches hasMoreHistory
fc.assert(
  fc.property(fc.boolean(), (hasMore) => {
    render(<MatchedProfilesSection hasMoreHistory={hasMore} matchHistory={[makeMatch()]} ... />);
    const btn = screen.queryByRole('button', { name: /Xem thêm/i });
    if (hasMore) expect(btn).toBeInTheDocument();
    else expect(btn).not.toBeInTheDocument();
  })
);
```

### Integration / Smoke Tests

- Render `Matching.tsx` đầy đủ với `remainingMatches=0` và mock `useMatchingHistory` → verify `MatchedProfilesSection` mount không lỗi
- Render `Matching.tsx` với `remainingMatches=5` → verify `MatchedProfilesSection` không xuất hiện, `MatchingHistory` vẫn render bình thường
- Manual regression: Bật app, hết lượt → xem section; reset lượt → section tự ẩn

### Accessibility

- `Message_Button` phải có `aria-label="Nhắn tin với {fullName}"` để screen reader phân biệt các nút
- Skeleton items nên có `aria-busy="true"` và `aria-label="Đang tải hồ sơ"`
- Tối thiểu 44×44px cho touch target trên mobile (class `min-h-[44px] min-w-[44px]`)
