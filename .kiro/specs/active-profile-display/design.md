# Design Document: Active Profile Display

## Overview

Tính năng Active Profile Display tích hợp dữ liệu trạng thái hoạt động từ Firebase Realtime Database vào pipeline ghép đôi của TVU Connect, ưu tiên hiển thị những hồ sơ đang online hoặc mới hoạt động lên đầu kết quả tìm kiếm và bổ sung Activity_Badge trực quan lên mỗi thẻ hồ sơ.

### Vấn đề hiện tại

Pipeline ghép đôi (`matchingService.ts` + `useCachedMatching.ts`) sắp xếp hồ sơ thuần túy theo `Matching_Score` từ `calculateMatchingScore()`. `ProfileCard.tsx` đã có component `<OnlineStatus>` nhưng trạng thái này không ảnh hưởng đến thứ tự hiển thị. Hệ thống `user-activity-status` (lưu ở `presence/{uid}` trong Firebase Realtime Database) đã tồn tại nhưng chưa được dùng trong matching pipeline.

### Phạm vi thay đổi

| Module | Loại thay đổi |
|---|---|
| `src/utils/activityBooster.ts` | **Tạo mới** — Module tính Active_Score và Composite_Score |
| `src/utils/batchStatusFetcher.ts` | **Tạo mới** — Batch fetch presence data từ Realtime DB |
| `src/services/matchingService.ts` | **Cập nhật** — Tích hợp Activity_Booster vào pipeline |
| `src/components/ProfileCard.tsx` | **Cập nhật** — Hiển thị Activity_Badge và "🟢 Đang online" |
| `src/types.ts` | **Cập nhật** — Thêm `ActivityData`, `PresenceData` types |

---

## Architecture

### Flow tổng quan

```mermaid
graph TD
    A[User bấm Bắt đầu ghép cặp] --> B[matchingService.fetchMatchingProfiles]
    B --> C[Firestore: lấy danh sách profiles]
    C --> D[applyFilters - lọc theo tab/filters]
    D --> E[calculateMatchingScore - tính Matching_Score]
    E --> F{Batch_Status_Fetcher}
    F -->|fetch presence/{uid} từ RTDB| G[Firebase Realtime DB]
    G -->|presence data| F
    F -->|lỗi/timeout| H[presenceMap rỗng]
    F -->|thành công| I[presenceMap có dữ liệu]
    H --> J[Activity_Booster: Active_Score = 0 cho tất cả]
    I --> J
    J --> K[Composite_Score = 0.7 × Matching + 0.3 × Active]
    K --> L[Sort theo Composite_Score giảm dần]
    L --> M[Giới hạn ≤2 Stale_Profile trong batch 4]
    M --> N[ProfileCard render với Activity_Badge]
```

### Nguyên tắc thiết kế

1. **Không thêm Firestore listener** — Chỉ dùng `get()` một lần (Realtime DB), tránh bug INTERNAL ASSERTION FAILED đã từng xảy ra.
2. **Fail gracefully** — Mọi lỗi từ Batch_Status_Fetcher đều dẫn đến fallback về Matching_Score thuần, không bao giờ block pipeline.
3. **Tách biệt concerns** — `activityBooster.ts` là pure function (không Firebase), `batchStatusFetcher.ts` xử lý I/O và cache.
4. **ProfileCard không biết về pipeline** — Badge chỉ nhận props `activityData`, không tự fetch, không re-render theo hồ sơ khác.

---

## Components and Interfaces

### 1. `activityBooster.ts` (Pure Functions)

```typescript
// src/utils/activityBooster.ts

export type ActivityStatus = 'online' | 'away' | 'offline';

export interface ActivityData {
  status: ActivityStatus;
  lastActive: number; // Unix timestamp (ms)
  invisibleMode?: boolean;
}

export interface RawPresenceData {
  status?: string;
  lastActive?: number | string; // Unix timestamp hoặc ISO string
  settings?: {
    invisibleMode?: boolean;
  };
}

export interface ProfileWithScore {
  profile: StudentProfile;
  matchingScore: number;
  activeScore: number;
  compositeScore: number;
}

/** Tính Active_Score theo bậc thang thời gian */
export function calculateActiveScore(data: ActivityData | null): number;

/** Tính Composite_Score = 0.7 × matching + 0.3 × active */
export function calculateCompositeScore(
  matchingScore: number,
  activeScore: number
): number;

/** Parse raw presence data từ Firebase Realtime DB */
export function parsePresenceData(raw: RawPresenceData | null | undefined): ActivityData | null;

/** Format ActivityData ngược lại thành RawPresenceData (cho round-trip test) */
export function formatPresenceData(data: ActivityData): RawPresenceData;

/** Kiểm tra hồ sơ có phải Stale_Profile không (lastActive > 7 ngày) */
export function isStaleProfile(data: ActivityData | null): boolean;

/** Áp dụng Activity_Booster lên danh sách profiles đã có Matching_Score */
export function applyActivityBooster(
  profilesWithScores: Array<{ profile: StudentProfile; score: number }>,
  presenceMap: Map<string, ActivityData>
): ProfileWithScore[];

/** Giới hạn Stale_Profile trong batch: tối đa 2/4 */
export function limitStaleProfiles(
  profiles: ProfileWithScore[],
  batchSize: number
): ProfileWithScore[];
```

**Bảng tính Active_Score:**

| Điều kiện | Active_Score |
|---|---|
| `status === 'online'` | 100 |
| `lastActive` ≤ 1 giờ | 80 |
| `lastActive` ≤ 6 giờ | 60 |
| `lastActive` ≤ 24 giờ | 40 |
| `lastActive` ≤ 7 ngày | 20 |
| > 7 ngày hoặc không có data | 0 |

> **Lưu ý ưu tiên**: `status === 'online'` được kiểm tra trước, bất kể `lastActive` là gì.

---

### 2. `batchStatusFetcher.ts` (I/O + Cache)

```typescript
// src/utils/batchStatusFetcher.ts

const BATCH_CACHE_TTL_MS = 60_000;  // 60 giây
const BATCH_TIMEOUT_MS  = 2_000;    // 2 giây

interface BatchCacheEntry {
  data: Map<string, ActivityData>;
  fetchedAt: number;
}

/** Fetch presence data của nhiều UIDs cùng một lúc từ Firebase Realtime DB */
export async function batchFetchPresenceStatus(
  uids: string[]
): Promise<Map<string, ActivityData>>;

/** Xóa cache (dùng trong tests) */
export function clearBatchStatusCache(): void;

/** Lấy thống kê cache hiện tại (debug) */
export function getBatchStatusCacheStats(): {
  size: number;
  oldestEntryAgeMs: number | null;
};
```

**Caching strategy:**
- Cache key: `JSON.stringify(sorted_uids)` — cùng một tập UIDs trả về cùng cache entry.
- TTL: 60 giây. Sau TTL, fetch lại từ Firebase.
- Dùng `get(ref(realtimeDb, 'presence'))` một lần với `orderByChild` để lấy tất cả — không dùng `onSnapshot`.

**Timeout strategy:**
```typescript
const result = await Promise.race([
  fetchFromFirebase(uids),
  new Promise<null>(resolve => setTimeout(() => resolve(null), BATCH_TIMEOUT_MS))
]);
if (result === null) return new Map(); // fallback rỗng
```

---

### 3. Cập nhật `matchingService.ts`

Thêm bước Activity_Booster vào sau khi tính Matching_Score:

```typescript
// Trong fetchMatchingProfiles(), sau bước calculateMatchingScore:

// 1. Batch fetch presence data
const uids = allProfiles.map(p => p.uid);
const presenceMap = await batchFetchPresenceStatus(uids); // fallback = Map rỗng nếu lỗi

// 2. Apply Activity_Booster
const profilesWithBoost = applyActivityBooster(
  profilesWithScores,   // Array<{profile, score}>
  presenceMap
);

// 3. Sort theo Composite_Score
const sortedProfiles = profilesWithBoost.sort((a, b) => b.compositeScore - a.compositeScore);

// 4. Giới hạn stale profiles
const limitedWithStale = limitStaleProfiles(sortedProfiles, 4);

// 5. Lấy 4 hồ sơ đầu
const top4 = limitedWithStale.slice(0, 4);
```

**Fallback khi batchFetchPresenceStatus thất bại:**
Vì `batchFetchPresenceStatus` luôn trả về `Map` (rỗng nếu lỗi), `applyActivityBooster` với `Map` rỗng sẽ gán `activeScore = 0` cho tất cả, tương đương Composite_Score = Matching_Score × 0.7. Thứ tự tương đối không đổi.

---

### 4. Cập nhật `ProfileCard.tsx`

Thêm props `activityData` và hiển thị Activity_Badge:

```typescript
interface ProfileCardProps {
  profile: StudentProfile;
  activityData?: ActivityData | null;   // Thêm mới
  isInOnlineBatch?: boolean;            // Có hồ sơ offline trong cùng batch không
  onRematch?: () => void;
  onStartChat?: (uid: string) => void;
  showActions?: boolean;
}
```

**Activity_Badge** — đặt ở `position: absolute; bottom: 0; right: 0` bên trong wrapper avatar:

```tsx
{/* Activity_Badge trên avatar */}
{activityData && !activityData.invisibleMode && (
  <ActivityBadge activityData={activityData} />
)}

{/* Nhãn "🟢 Đang online" phía trên tên — chỉ khi online VÀ batch có offline */}
{activityData?.status === 'online' && isInOnlineBatch && (
  <span className="text-xs font-bold text-green-600 dark:text-green-400">
    🟢 Đang online
  </span>
)}

{/* Status text bên cạnh tên */}
{activityData && !activityData.invisibleMode && (
  <ActivityStatusText activityData={activityData} />
)}
```

**Component `ActivityBadge`** (inline hoặc file riêng):

```tsx
// Màu sắc theo spec:
// online → #22c55e (green-500), 10×10px, viền trắng 2px
// recent (<24h) → #f59e0b (amber-400), 10×10px, viền trắng 2px
// >24h → không render
```

**Component `ActivityStatusText`:**

| Điều kiện | Text hiển thị | Màu |
|---|---|---|
| `status === 'online'` | `● Online` | `#22c55e` |
| `lastActive` ≤ 1 giờ | `Vừa hoạt động` | xanh lá nhạt |
| `lastActive` ≤ 24 giờ | `Hoạt động X giờ trước` | xám |
| > 24 giờ hoặc không có data | không render | — |

**Tối ưu re-render:**
`ProfileCard` đã được wrap bằng `React.memo`. Props `activityData` là object nhỏ được truyền từ parent, nếu parent không tạo object mới thì ProfileCard không re-render. Parent (`MatchingResults`) nên memoize `activityData` map bằng `useMemo`.

---

### 5. Cập nhật `MatchingResults` (component con của `Matching.tsx`)

Nhận thêm `activityDataMap: Map<string, ActivityData>` từ `Matching.tsx` và truyền xuống mỗi `ProfileCard`.

```typescript
interface MatchingResultsProps {
  profiles: StudentProfile[];
  activityDataMap: Map<string, ActivityData>; // Thêm mới
  isInOnlineBatch: boolean;                   // Thêm mới
  reasons: Map<string, string[]>;
  // ... các props cũ
}
```

---

## Data Models

### `ActivityData` (type trong `src/utils/activityBooster.ts`)

```typescript
export interface ActivityData {
  status: 'online' | 'away' | 'offline';
  lastActive: number;       // Unix timestamp (ms) — đã normalize từ raw
  invisibleMode: boolean;   // Ẩn badge và status text
}
```

### `RawPresenceData` (schema Firebase Realtime DB tại `presence/{uid}`)

```typescript
interface RawPresenceData {
  status?: 'online' | 'away' | 'offline' | string;  // any string → fallback 'offline'
  lastActive?: number | string;  // Unix ms hoặc ISO 8601 string
  connections?: Record<string, {
    device: string;
    timestamp: number;
    userAgent?: string;
  }>;
  settings?: {
    invisibleMode?: boolean;
    privacyMode?: boolean;
  };
}
```

**Parse rules cho `lastActive`:**
- `number` → dùng trực tiếp làm Unix ms
- `string` → `Date.parse(str)` (xử lý ISO 8601); nếu `NaN` → dùng `0`
- `null/undefined` → `0`

**Parse rules cho `status`:**
- `'online' | 'away' | 'offline'` → giữ nguyên
- Bất kỳ giá trị khác (kể cả `undefined`, `null`) → `'offline'`

### `ProfileWithScore` (type nội bộ trong `activityBooster.ts`)

```typescript
export interface ProfileWithScore {
  profile: StudentProfile;
  matchingScore: number;    // 0–100, từ calculateMatchingScore
  activeScore: number;      // 0|20|40|60|80|100, từ calculateActiveScore
  compositeScore: number;   // 0.7×matching + 0.3×active
}
```

---

## Correctness Properties

*A property là một đặc tính hay hành vi phải đúng trên tất cả các thực thi hợp lệ của hệ thống — về cơ bản là một phát biểu chính thức về những gì hệ thống phải làm. Properties là cầu nối giữa các đặc tả con người và các đảm bảo tính đúng đắn có thể kiểm chứng tự động.*

---

### Property 1: Active_Score nằm trong tập hợp hợp lệ

*Với bất kỳ* `ActivityData` hợp lệ nào, `calculateActiveScore` phải trả về đúng một trong các giá trị `{0, 20, 40, 60, 80, 100}`.

**Validates: Requirements 1.1**

---

### Property 2: Composite_Score tuân theo công thức trọng số

*Với bất kỳ* cặp `(matchingScore, activeScore)` trong khoảng `[0, 100]`, `calculateCompositeScore(m, a)` phải trả về đúng `m × 0.7 + a × 0.3` (sai số tối đa `1e-9`).

**Validates: Requirements 1.2**

---

### Property 3: Kết quả được sắp xếp theo Composite_Score giảm dần

*Với bất kỳ* danh sách hồ sơ ngẫu nhiên có scores, sau khi `applyActivityBooster` và sort, `compositeScore[i] >= compositeScore[i+1]` cho mọi `i`.

**Validates: Requirements 1.4, 4.1**

---

### Property 4: Cache idempotent — fetch thứ hai trả về cùng kết quả

*Với bất kỳ* tập UIDs nào, nếu `batchFetchPresenceStatus(uids)` được gọi lần thứ hai trong vòng 60 giây kể từ lần đầu, kết quả trả về phải giống hệt lần đầu và Firebase không được gọi thêm.

**Validates: Requirements 2.4**

---

### Property 5: Fallback về Matching_Score khi fetch lỗi

*Với bất kỳ* danh sách profiles nào, khi `batchFetchPresenceStatus` trả về `Map` rỗng, thứ tự sắp xếp theo `compositeScore` phải có cùng thứ tự tương đối như khi sắp xếp thuần túy theo `matchingScore`.

**Validates: Requirements 6.2**

---

### Property 6: Parse `lastActive` từ Unix và ISO string cho kết quả tương đương

*Với bất kỳ* timestamp `t` (ms) hợp lệ nào, `parsePresenceData({ lastActive: t })` và `parsePresenceData({ lastActive: new Date(t).toISOString() })` phải trả về `ActivityData` với cùng giá trị `lastActive`.

**Validates: Requirements 7.1**

---

### Property 7: Parse `status` không hợp lệ luôn fallback về `'offline'`

*Với bất kỳ* string ngẫu nhiên nào không thuộc tập `{'online', 'away', 'offline'}`, `parsePresenceData({ status: randomString })` phải trả về `ActivityData` với `status === 'offline'`.

**Validates: Requirements 7.2**

---

### Property 8: Round-trip parse–format–parse cho dữ liệu hợp lệ

*Với bất kỳ* `ActivityData` hợp lệ nào, `parsePresenceData(formatPresenceData(data))` phải trả về `ActivityData` tương đương (cùng `status`, `lastActive`, `invisibleMode`).

**Validates: Requirements 7.3**

---

### Property 9: Stale_Profile không chiếm quá 2/4 vị trí khi có lựa chọn tốt hơn

*Với bất kỳ* danh sách profiles nào trong đó có ít nhất 2 hồ sơ không phải Stale_Profile, `limitStaleProfiles(profiles, 4)` phải trả về batch trong đó số Stale_Profile ≤ 2.

**Validates: Requirements 4.3**

---

### Property 10: Active_Score nhất quán qua mọi mode

*Với bất kỳ* `ActivityData` và mode bất kỳ (`lover`, `hobby`, `study`, `quick`), `calculateActiveScore` phải trả về cùng giá trị (hàm không phụ thuộc vào mode).

**Validates: Requirements 5.1**

---

## Error Handling

### Lỗi từ `batchFetchPresenceStatus`

| Loại lỗi | Hành vi |
|---|---|
| Firebase timeout (>2s) | Trả về `Map()` rỗng |
| Firebase permission error | Trả về `Map()` rỗng, log warning |
| Network error | Trả về `Map()` rỗng |
| Lỗi parse dữ liệu | Skip uid đó, giữ các uid khác |

Pipeline không bao giờ throw vì `batchFetchPresenceStatus`. Tất cả lỗi được catch nội bộ:

```typescript
export async function batchFetchPresenceStatus(uids: string[]): Promise<Map<string, ActivityData>> {
  if (uids.length === 0) return new Map();
  try {
    // check cache...
    const result = await Promise.race([fetchFromRTDB(uids), timeoutPromise]);
    return result ?? new Map();
  } catch (e) {
    console.warn('[BatchStatusFetcher] Fetch failed, falling back:', e);
    return new Map(); // NEVER throw
  }
}
```

### Lỗi từ `parsePresenceData`

`parsePresenceData` là pure function, không throw. Mọi input không hợp lệ trả về `null` hoặc giá trị mặc định an toàn.

### Lỗi từ `calculateActiveScore`

Nếu `data` là `null`, trả về `0`. Không throw.

### Lỗi khi render `ProfileCard`

Nếu `activityData` là `null` hoặc `undefined`, Activity_Badge và status text không render (ẩn hoàn toàn). ProfileCard vẫn hiển thị bình thường.

---

## Testing Strategy

### Thư viện test

- **Unit / Property tests**: Vitest (`vitest`) + `fast-check` (đã có sẵn trong `devDependencies`)
- **Component tests**: Vitest + `@testing-library/react` (đã có sẵn)

### Cấu trúc file test

```
src/utils/activityBooster.pbt.test.ts   ← Property-based tests (fast-check)
src/utils/activityBooster.test.ts       ← Unit tests (examples, edge cases)
src/utils/batchStatusFetcher.test.ts    ← Unit tests với Firebase mock
src/components/ProfileCard.activity.test.tsx ← Component tests cho badge UI
```

### Property-Based Tests (`activityBooster.pbt.test.ts`)

Mỗi test chạy tối thiểu 100 iterations với `fc.assert(fc.property(...))`.

```typescript
// Feature: active-profile-display, Property 1: Active_Score nằm trong tập hợp hợp lệ
test('Property 1: Active_Score luôn thuộc {0, 20, 40, 60, 80, 100}', () => {
  fc.assert(fc.property(
    fc.record({
      status: fc.constantFrom('online', 'away', 'offline'),
      lastActive: fc.integer({ min: 0, max: Date.now() }),
      invisibleMode: fc.boolean(),
    }),
    (data) => {
      const score = calculateActiveScore(data);
      expect([0, 20, 40, 60, 80, 100]).toContain(score);
    }
  ), { numRuns: 200 });
});

// Feature: active-profile-display, Property 2: Composite_Score tuân theo công thức
test('Property 2: compositeScore = 0.7*matching + 0.3*active', () => {
  fc.assert(fc.property(
    fc.float({ min: 0, max: 100, noNaN: true }),
    fc.float({ min: 0, max: 100, noNaN: true }),
    (m, a) => {
      const composite = calculateCompositeScore(m, a);
      expect(composite).toBeCloseTo(m * 0.7 + a * 0.3, 9);
    }
  ), { numRuns: 500 });
});

// Feature: active-profile-display, Property 3: Sort giảm dần theo Composite_Score
test('Property 3: applyActivityBooster trả về kết quả đã sắp xếp giảm dần', () => {
  fc.assert(fc.property(
    fc.array(fc.record({
      profile: arbitraryStudentProfile(),
      score: fc.float({ min: 0, max: 100, noNaN: true }),
    }), { minLength: 1, maxLength: 20 }),
    fc.array(arbitraryPresenceEntry(), { minLength: 0, maxLength: 20 }),
    (profilesWithScores, presenceEntries) => {
      const presenceMap = new Map(presenceEntries);
      const result = applyActivityBooster(profilesWithScores, presenceMap);
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].compositeScore).toBeGreaterThanOrEqual(result[i+1].compositeScore);
      }
    }
  ), { numRuns: 100 });
});
```

**Các property còn lại** (Property 4–10) được implement tương tự với generators phù hợp.

### Unit Tests (`activityBooster.test.ts`)

Tập trung vào:
- Boundary values: `lastActive` đúng 1h, 6h, 24h, 7d
- `status = 'online'` override `lastActive`
- Input `null/undefined` → score = 0, không throw
- Stale limit: 4 stale profiles → log warning, trả về tất cả

### Unit Tests (`batchStatusFetcher.test.ts`)

```typescript
// Mock Firebase Realtime DB
vi.mock('../firebase', () => ({
  realtimeDb: {},
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  get: vi.fn(),
}));
```

Các test case:
- UIDs rỗng → Map rỗng, không gọi Firebase
- Firebase timeout → Map rỗng sau 2s
- Firebase lỗi → Map rỗng, không throw
- Cache hit (60s TTL): fetch lần 2 không gọi Firebase
- Cache miss (sau 60s): fetch lại Firebase

### Component Tests (`ProfileCard.activity.test.tsx`)

- Render với `activityData.status = 'online'` → badge xanh xuất hiện
- Render với `lastActive < 24h` → badge vàng xuất hiện
- Render với `lastActive > 24h` → không có badge
- Render với `invisibleMode = true` → không badge, không status text
- Render với `activityData = null` → không badge (không crash)
- Label "🟢 Đang online" xuất hiện khi `isInOnlineBatch = true`
- Label "🟢 Đang online" không xuất hiện khi `isInOnlineBatch = false`

### Test cân bằng

Unit test tập trung vào các ví dụ cụ thể và edge case. Property test xử lý coverage input rộng. Hạn chế viết quá nhiều unit test trùng lắp với property test — ưu tiên property test cho `calculateActiveScore`, `calculateCompositeScore`, `parsePresenceData`, và `applyActivityBooster`.
