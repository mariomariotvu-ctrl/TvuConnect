# Design Document — matching-history-display

## Overview

Tính năng này bổ sung một section hiển thị lịch sử ghép đôi ngay khi người dùng hết lượt ghép (`remainingMatches === 0`). Kiến trúc tổng thể gồm ba phần chính:

1. **Tạo component mới `MatchingHistorySection`** (cùng sub-component `MatchedProfileCard`) trong thư mục `src/components/matching/`. Component này nhận toàn bộ dữ liệu qua props, không tự fetch.
2. **Tích hợp vào `Matching.tsx`** bằng conditional render React thuần — section chỉ xuất hiện trong DOM khi `remainingMatches === 0`, biến mất hoàn toàn khi `remainingMatches > 0`.
3. **Tái sử dụng hạ tầng hiện có** — hook `useMatchingHistory` đã có sẵn và đang được gọi trong `Matching.tsx`, chỉ cần destructure thêm `isLoading` và `error`. Handler `onStartChat` được truyền từ `App.tsx` xuống qua props.

Không có thay đổi nào đối với `MatchingHistory` hiện tại (lịch sử ở cuối trang) và không có thay đổi logic ghép cặp.

---

## Architecture

Sơ đồ cây component sau khi tích hợp:

```
Matching.tsx
├── MatchingFilters
├── [Error Message]                         (khi error !== null)
├── DailyLimitBanner                        (khi remainingMatches === 0)
├── MatchingHistorySection  ← MỚI          (chỉ khi remainingMatches === 0)
│   └── MatchedProfileCard[]  ← MỚI
│       ├── Avatar (ảnh hoặc UserIcon fallback)
│       ├── Tên + Ngành
│       ├── Ngày ghép (dd/MM/yyyy hoặc "Không rõ ngày")
│       └── Nút "Nhắn tin" (ẩn nếu !onStartChat hoặc !uid)
├── LowMatchWarning                         (khi remainingMatches <= 3)
├── StartMatchingButton
├── MatchingResults
└── MatchingHistory  ← GIỮ NGUYÊN         (cuối trang, không thay đổi)
```

**Luồng dữ liệu tổng quan:**

```
App.tsx
  └─ handleStartChat(uid)  ──→  Matching.tsx (prop: onStartChat)
                                    │
                                    ├─ useMatchingHistory(uid, blockedSet, initialLimit)
                                    │       └─ trả về: matchHistory, hasMoreHistory,
                                    │                  loadMore, isLoading, historyError
                                    │
                                    │  remainingMatches (state nội bộ Matching.tsx)
                                    │       └─ điều khiển conditional render
                                    │
                                    └─ MatchingHistorySection (props)
                                            └─ MatchedProfileCard (props)
                                                    └─ gọi onStartChat khi nhấn "Nhắn tin"
```

---

## Components and Interfaces

### MatchingHistorySection

**File:** `src/components/matching/MatchingHistorySection.tsx`

**Interface props:**

```ts
interface MatchingHistorySectionProps {
  matches: Match[];
  hasMoreHistory: boolean;
  loadMore: () => void;
  isLoading: boolean;
  error: string | null;
  onStartChat?: (uid: string) => void; // optional — ẩn nút "Nhắn tin" nếu không có
}
```

**Behavior theo từng state:**

| State | Điều kiện | Render |
|---|---|---|
| Loading | `isLoading === true` | 3 skeleton item (animate-pulse, cùng chiều cao card thực) |
| Error | `error !== null` | Banner lỗi tiếng Việt, style nhất quán với error hiện tại |
| Empty | `isLoading === false && matches.length === 0` | Empty state icon + "Chưa có hồ sơ nào được ghép" |
| Data | `isLoading === false && matches.length > 0` | Danh sách `MatchedProfileCard` + nút "Xem thêm" nếu `hasMoreHistory` |

**Header của section:**
- Icon `History` từ `lucide-react`, size `w-5 h-5`, màu `text-indigo-600`
- Tiêu đề `"Hồ sơ đã ghép"` — `text-lg font-bold text-gray-900`
- Mô tả `"Xem lại và nhắn tin với những người đã ghép trước đó"` — `text-sm text-gray-500`

---

### MatchedProfileCard

Đặt như sub-component trong cùng file `MatchingHistorySection.tsx`.

**Interface props:**

```ts
interface MatchedProfileCardProps {
  match: Match;
  onStartChat?: (uid: string) => void;
}
```

**Các phần tử hiển thị:**

- **Avatar:** `w-12 h-12 rounded-[14px]` — hiển thị `photoURL` nếu có, fallback `UserIcon` nếu không có ảnh hoặc ảnh lỗi
- **Tên:** `match.matchedProfile.fullName` — `font-bold text-gray-900 text-[15px] line-clamp-1`
- **Ngành:** `match.matchedProfile.major` — fallback `"Chưa cập nhật"`, `text-sm text-indigo-500/80 font-bold`
- **Ngày ghép:** Lấy từ `match.createdAt?.toDate()`, format `dd/MM/yyyy` bằng `toLocaleDateString('vi-VN')`. Nếu `createdAt` là `null/undefined` → hiển thị `"Không rõ ngày"`
- **Nút "Nhắn tin":** Chỉ render khi `onStartChat` được cung cấp VÀ `match.matchedProfile?.uid` hợp lệ. Gọi `onStartChat(match.matchedProfile.uid)` khi nhấn.

**Guard an toàn:** Nếu `match.matchedProfile` là `null` hoặc `undefined`, component trả về `null` để tránh crash.

---

### Thay đổi trong Matching.tsx

**1. Thêm prop `onStartChat` vào MatchingProps:**

```ts
interface MatchingProps {
  currentUser: User;
  onMatchFound: (profile: StudentProfile) => void;
  mode: 'lover' | 'study' | 'quick' | 'hobby';
  onStartChat?: (uid: string) => void; // thêm mới
}
```

**2. Import thêm:**

```ts
import { MatchingHistorySection } from './matching/MatchingHistorySection';
```

**3. Destructure thêm từ `useMatchingHistory`:**

```ts
// Trước
const { matchHistory, hasMoreHistory, loadMore } = useMatchingHistory(...);

// Sau (alias historyError tránh conflict với error từ useCachedMatching)
const { matchHistory, hasMoreHistory, loadMore, isLoading, error: historyError } = useMatchingHistory(...);
```

**4. JSX conditional render sau DailyLimitBanner:**

```tsx
{remainingMatches === 0 && (
  <MatchingHistorySection
    matches={matchHistory}
    hasMoreHistory={hasMoreHistory}
    loadMore={loadMore}
    isLoading={isLoading}
    error={historyError}
    onStartChat={onStartChat}
  />
)}
```

---

## Data Models

Tính năng này không thêm model dữ liệu mới. Các kiểu đã có trong codebase được tái sử dụng hoàn toàn:

### Match (đã có trong `src/types/`)

```ts
interface Match {
  id: string;
  userUid: string;
  matchedUid: string;
  matchedProfile: StudentProfile | null; // null khi dữ liệu legacy hoặc race condition
  createdAt: Timestamp | null;           // Firestore Timestamp, có thể null
  // ... các trường khác
}
```

### StudentProfile (đã có trong `src/types/`)

Các trường sử dụng trong `MatchedProfileCard`:
- `uid: string` — dùng để gọi `onStartChat`
- `fullName: string` — tên hiển thị
- `major: string | undefined` — ngành học
- `photoURL: string | undefined` — ảnh đại diện

### UseMatchingHistoryReturn (đã có trong `src/hooks/useMatchingHistory.ts`)

```ts
interface UseMatchingHistoryReturn {
  matchHistory: Match[];
  rawMatches: Match[];
  hasMoreHistory: boolean;
  loadMore: () => void;
  isLoading: boolean;
  error: string | null;
}
```

Hook được gọi với `initialLimit = FIRESTORE_LIMITS.MATCH_HISTORY_INITIAL` (hiện tại là 5). Nút "Xem thêm" gọi `loadMore()` để tăng thêm 10 item.

---

## Correctness Properties

### Property 1: Conditional render dựa trên remainingMatches

`MatchingHistorySection` phải xuất hiện trong DOM khi và chỉ khi `remainingMatches === 0`. Khi `remainingMatches > 0`, component không được tồn tại trong DOM (không phải CSS ẩn). Khi `remainingMatches` thay đổi từ `0` sang `> 0`, component phải unmount tự động theo re-render của React.

**Validates: Requirements 1.1, 1.2, 8.1, 8.2**

### Property 2: Null safety cho matchedProfile

Với bất kỳ `Match` nào có `matchedProfile === null` hoặc `matchedProfile === undefined`, `MatchedProfileCard` phải trả về `null` mà không crash. Nếu `onStartChat` không được truyền vào, nút "Nhắn tin" không được render. Nếu `match.matchedProfile.uid` là falsy, nút "Nhắn tin" không được render.

**Validates: Requirements 3.6, 5.4, 7.1**

### Property 3: Tính nhất quán của state hiển thị

Tại bất kỳ thời điểm nào, chỉ một trong các state sau được render — không bao giờ có hai state cùng lúc: `isLoading === true` → skeleton (không phải danh sách); `error !== null` → error banner (không phải skeleton, không phải danh sách); `matches.length === 0 && !isLoading && !error` → empty state; `matches.length > 0 && !isLoading && !error` → danh sách card.

**Validates: Requirements 1.4, 1.5, 1.6, 7.1**

### Property 4: Không phá vỡ behavior hiện tại

Khi `remainingMatches > 0`, toàn bộ giao diện `Matching.tsx` hoạt động giống như trước khi có tính năng này. `MatchingHistory` ở cuối trang vẫn render đúng. Biến `error` từ `useCachedMatching` và `historyError` từ `useMatchingHistory` là hai biến độc lập, không conflict với nhau.

**Validates: Requirements 6.2, 6.3, 6.4**

---

## Error Handling

### Lỗi từ Firestore (hook trả về `error !== null`)

`MatchingHistorySection` hiển thị banner lỗi tiếng Việt thay vì danh sách:

```
"Không thể tải lịch sử ghép. Vui lòng thử lại sau."
```

Style nhất quán với error message hiện có trong `Matching.tsx`:
```
p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium flex items-center gap-2
```

### Ảnh đại diện bị lỗi (onError)

```tsx
<img
  src={match.matchedProfile.photoURL}
  onError={(e) => { e.currentTarget.style.display = 'none'; /* show fallback */ }}
/>
```

Fallback: `UserIcon` từ `lucide-react` với màu `text-gray-300`.

### `createdAt` là null

```tsx
{match.createdAt?.toDate
  ? match.createdAt.toDate().toLocaleDateString('vi-VN')
  : 'Không rõ ngày'}
```

### `matchedProfile` là null

```tsx
// Trong MatchedProfileCard
if (!match.matchedProfile) return null;
```

Ngoài ra, `useMatchingHistory` đã filter `validMatches = matches.filter(m => m.matchedProfile != null)` trước khi trả về — đây là lớp bảo vệ thứ hai.

---

## Testing Strategy

### Unit test cho MatchingHistorySection

| Test case | Input | Expected |
|---|---|---|
| Hiển thị skeleton khi loading | `isLoading=true` | 3 skeleton item |
| Hiển thị error banner | `error="some error"` | Thông báo lỗi tiếng Việt |
| Hiển thị empty state | `matches=[], isLoading=false` | Text "Chưa có hồ sơ nào được ghép" |
| Hiển thị danh sách | `matches=[...5 items]` | 5 MatchedProfileCard |
| Nút "Xem thêm" xuất hiện | `hasMoreHistory=true` | Nút "Xem thêm" visible |
| Nút "Xem thêm" ẩn | `hasMoreHistory=false` | Nút không có trong DOM |
| Gọi loadMore khi nhấn | Nhấn nút "Xem thêm" | `loadMore()` được gọi 1 lần |

### Unit test cho MatchedProfileCard

| Test case | Input | Expected |
|---|---|---|
| Ẩn khi matchedProfile null | `match.matchedProfile=null` | Trả về null |
| Hiển thị fallback ngày | `match.createdAt=null` | "Không rõ ngày" |
| Fallback ngành | `major=undefined` | "Chưa cập nhật" |
| Ẩn nút Nhắn tin | `onStartChat=undefined` | Nút không render |
| Gọi onStartChat | Nhấn nút "Nhắn tin" | `onStartChat(uid)` được gọi |

### Integration test cho Matching.tsx

| Test case | Điều kiện | Expected |
|---|---|---|
| Section xuất hiện | `remainingMatches=0` | `MatchingHistorySection` trong DOM |
| Section ẩn | `remainingMatches=3` | `MatchingHistorySection` không trong DOM |
| Chuyển 0 → >0 | `remainingMatches` thay đổi | Section unmount không cần reload |
| Feature cũ không bị ảnh hưởng | `remainingMatches=5` | `MatchingHistory` cuối trang render bình thường |

### Files to Create/Modify

**TẠO MỚI:**
- `src/components/matching/MatchingHistorySection.tsx` — Component chính + sub-component `MatchedProfileCard`

**SỬA ĐỔI:**
- `src/components/Matching.tsx`:
  - Thêm prop `onStartChat?: (uid: string) => void` vào `MatchingProps`
  - Import `MatchingHistorySection`
  - Destructure thêm `isLoading`, `error` (alias `historyError`) từ `useMatchingHistory`
  - Thêm JSX conditional render `{remainingMatches === 0 && <MatchingHistorySection ... />}` sau `DailyLimitBanner`

**KHÔNG THAY ĐỔI:**
- `src/components/matching/MatchingHistory.tsx` — giữ nguyên, vẫn ở cuối trang
- `src/hooks/useMatchingHistory.ts` — interface đã đủ
- `src/types/index.ts` — kiểu `Match`, `StudentProfile` đã đủ
