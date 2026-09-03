# Matching History Null Crash — Bugfix Design

## Overview

Bug `TypeError: undefined is not an object (evaluating 'e.matchedProfile.photoURL')` xảy ra khi `MatchingHistory` render các `Match` document từ Firestore mà field `matchedProfile` bị thiếu, `null`, hoặc `undefined`. Nguyên nhân là dữ liệu cũ (legacy) trong Firestore hoặc race condition khi ghi document.

Chiến lược fix áp dụng **defense-in-depth** tại ba lớp:
1. **Hook layer** (`useMatchingHistory.ts`): filter bỏ documents không hợp lệ trước khi đưa vào state
2. **Component layer** (`MatchingHistory.tsx`): null guard khi render từng item
3. **Type layer** (`types.ts`): khai báo `matchedProfile` là optional để phản ánh đúng thực tế
4. **Caller layer** (`Matching.tsx`): null check trước khi gọi `handleProfileClick`

> **Trạng thái hiện tại**: Fix đã được implement đầy đủ trong source code. Các tasks tập trung vào việc viết tests để verify và confirm fix hoạt động đúng.

---

## Glossary

- **Bug_Condition (C)**: Điều kiện kích hoạt bug — khi `Match` document có `matchedProfile` là `null`, `undefined`, hoặc thiếu field
- **Property (P)**: Hành vi mong muốn — hệ thống không crash, bỏ qua document không hợp lệ và render bình thường các document hợp lệ
- **Preservation**: Toàn bộ hành vi hiện tại với các `Match` document hợp lệ (có `matchedProfile`) phải giữ nguyên sau fix
- **`useMatchingHistory`**: Custom hook tại `src/hooks/useMatchingHistory.ts` — subscribe Firestore, filter, deduplicate, phân trang
- **`MatchingHistory`**: Component tại `src/components/matching/MatchingHistory.tsx` — render danh sách match history
- **`Matching.tsx`**: Parent component tại `src/components/Matching.tsx` — xử lý callback `onProfileClick`
- **`matchedProfile`**: Field trong `Match` document — có thể vắng mặt do legacy data hoặc write race condition
- **`validMatches`**: Biến trong `useMatchingHistory` sau khi đã filter bỏ documents không hợp lệ

---

## Bug Details

### Bug Condition

Bug xảy ra khi Firestore trả về một `Match` document không có `matchedProfile` đầy đủ (do dữ liệu cũ hoặc race condition khi ghi). Trước khi fix, không có bất kỳ null check nào trước khi truy cập các property của `matchedProfile`.

**Formal Specification:**

```
FUNCTION isBugCondition(match)
  INPUT: match of type Match (from Firestore)
  OUTPUT: boolean

  RETURN match.matchedProfile = null
      OR match.matchedProfile = undefined
      OR match.matchedProfile field is missing
END FUNCTION
```

### Examples

- `match.matchedProfile = undefined` → `MatchingHistory` crash khi truy cập `match.matchedProfile.photoURL`
- `match.matchedProfile = null` → `MatchingHistory` crash khi truy cập `match.matchedProfile.fullName`
- `match.matchedProfile = null` → `Matching.tsx` gọi `handleProfileClick(null)` gây lỗi runtime
- `match.matchedProfile` là `StudentProfile` hợp lệ → không bị ảnh hưởng (không phải bug condition)

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Khi `matchedProfile` hợp lệ, render avatar, tên, ngành học, timestamp đúng như trước
- Khi người dùng click vào match item hợp lệ, gọi `handleProfileClick` và mở profile
- `useMatchingHistory` tiếp tục filter blocked users, deduplicate, phân trang như trước
- Khi `matchHistory` rỗng, `MatchingHistory` trả về `null` (không render)
- Nút "Xem thêm lịch sử" tiếp tục hoạt động đúng

**Scope:**
Tất cả inputs KHÔNG phải bug condition (tức là `matchedProfile` tồn tại và hợp lệ) phải hoàn toàn không bị ảnh hưởng bởi fix. Bao gồm:
- Các `Match` document có `matchedProfile` đầy đủ
- Tương tác click trên match item hợp lệ
- Các thao tác phân trang (loadMore)
- Logic filter blocked users và deduplication

---

## Hypothesized Root Cause

Dựa trên phân tích bug, nguyên nhân chính là:

1. **Thiếu null guard tại hook layer**: `useMatchingHistory` map Firestore documents trực tiếp sang `Match[]` mà không filter bỏ documents thiếu `matchedProfile`, dẫn đến state chứa invalid data.

2. **Thiếu null guard tại component layer**: `MatchingHistory` truy cập `match.matchedProfile.photoURL`, `match.matchedProfile.fullName`, `match.matchedProfile.major` mà không kiểm tra `matchedProfile` trước — crash ngay khi render item có `matchedProfile = null/undefined`.

3. **Type không phản ánh thực tế**: Interface `Match` trong `types.ts` khai báo `matchedProfile: StudentProfile` (required) nhưng thực tế Firestore có thể không có field này — TypeScript không cảnh báo về khả năng null/undefined.

4. **Caller không kiểm tra trước khi gọi callback**: `Matching.tsx` truyền `match` trực tiếp vào `handleProfileClick(match.matchedProfile)` mà không guard — nếu `matchedProfile` là null, callback nhận giá trị không hợp lệ.

---

## Correctness Properties

Property 1: Bug Condition — Null matchedProfile không gây crash

_For any_ `Match` document where `isBugCondition` returns true (tức là `matchedProfile` là null/undefined/thiếu), hệ thống sau fix SHALL bỏ qua document đó và không crash — cụ thể: `useMatchingHistory` filter bỏ document trước khi đưa vào state, `MatchingHistory` skip render item nếu `matchedProfile` falsy, và `Matching.tsx` không gọi `handleProfileClick` với giá trị null/undefined.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation — Match document hợp lệ hoạt động như cũ

_For any_ `Match` document where `isBugCondition` returns false (tức là `matchedProfile` tồn tại và hợp lệ), hệ thống sau fix SHALL tạo ra kết quả giống hệt hệ thống gốc — render avatar, tên, ngành học, timestamp đúng; click vào item gọi đúng `handleProfileClick`; phân trang và filter blocked users hoạt động đúng.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

---

## Fix Implementation

### Trạng thái: ĐÃ IMPLEMENT ĐẦY ĐỦ

Tất cả bốn lớp bảo vệ đã được implement trong source code hiện tại:

**File 1: `src/hooks/useMatchingHistory.ts`** ✅

```typescript
// Filter bỏ documents có matchedProfile null/undefined
const validMatches = matches.filter(m => m.matchedProfile != null);
setRawMatches(validMatches);
```

**File 2: `src/components/matching/MatchingHistory.tsx`** ✅

```tsx
{matches.map((match) => {
  // Skip items with missing matchedProfile (legacy data guard)
  if (!match.matchedProfile) return null;
  // ... render bình thường
})}
```

**File 3: `src/types.ts`** ✅

```typescript
export interface Match {
  id?: string;
  userUid: string;
  matchedUid: string;
  matchedProfile?: StudentProfile | null; // Optional: Firestore docs may lack this field
  createdAt: Timestamp;
}
```

**File 4: `src/components/Matching.tsx`** ✅

```tsx
<MatchingHistory
  matches={matchHistory}
  hasMore={hasMoreHistory}
  onProfileClick={(match) => match.matchedProfile && handleProfileClick(match.matchedProfile)}
  onLoadMore={loadMore}
/>
```

### Changes Required

Không còn thay đổi implementation nào cần thực hiện. Chỉ cần viết tests để verify.

---

## Testing Strategy

### Validation Approach

Vì fix đã được implement, testing strategy tập trung vào việc **verify** fix hoạt động đúng thay vì explore bug. Tuy nhiên, vẫn tuân theo cấu trúc exploration → preservation:

- **Exploration test (Property 1)**: Viết test xác nhận rằng documents với null `matchedProfile` bị filter bỏ và không gây crash → test PHẢI PASS trên code hiện tại (fix đã có)
- **Preservation test (Property 2)**: Viết property-based test xác nhận documents hợp lệ render đúng → test PHẢI PASS trên code hiện tại

### Exploratory Bug Condition Checking

**Goal**: Xác nhận rằng fix tại `useMatchingHistory` và `MatchingHistory` hoạt động đúng cho mọi input có `matchedProfile = null/undefined`.

**Test Plan**: Cung cấp Firestore documents giả có `matchedProfile = null` và `matchedProfile = undefined` cho hook/component, kiểm tra không có crash và items bị loại bỏ đúng cách.

**Test Cases**:
1. **Null matchedProfile**: `useMatchingHistory` filter bỏ document có `matchedProfile = null`
2. **Undefined matchedProfile**: `useMatchingHistory` filter bỏ document có `matchedProfile = undefined`
3. **Missing field**: Tương đương với undefined — bị filter bỏ
4. **MatchingHistory null guard**: Component trả về `null` cho item có `matchedProfile` falsy (không crash)
5. **Click guard trong Matching.tsx**: `onProfileClick` không gọi `handleProfileClick` khi `matchedProfile` là null

**Expected Results (trên code đã fix)**:
- Documents với null/undefined `matchedProfile` bị filter bỏ trước khi vào state
- Component không crash khi nhận item có `matchedProfile` falsy
- `handleProfileClick` không bao giờ nhận `null` hoặc `undefined`

### Fix Checking

**Goal**: Verify rằng với mọi input thỏa `isBugCondition`, hệ thống sau fix hoạt động đúng.

**Pseudocode:**
```
FOR ALL match WHERE isBugCondition(match) DO
  validMatches ← useMatchingHistory_fixed([match, ...otherValidMatches])
  ASSERT match NOT IN validMatches

  renderResult ← MatchingHistory_fixed([match])
  ASSERT renderResult does not crash
  ASSERT renderResult returns null for that item
END FOR
```

### Preservation Checking

**Goal**: Verify rằng với mọi input KHÔNG thỏa `isBugCondition`, fix không thay đổi hành vi.

**Pseudocode:**
```
FOR ALL match WHERE NOT isBugCondition(match) DO
  result_fixed ← useMatchingHistory_fixed([match])
  ASSERT match IN result_fixed

  rendered_fixed ← MatchingHistory_fixed([match])
  ASSERT rendered_fixed shows photoURL, fullName, major, timestamp
END FOR
```

**Testing Approach**: Property-based testing được khuyến khích cho preservation checking vì:
- Tự động sinh nhiều test case trên toàn bộ input domain
- Phát hiện edge cases mà manual tests có thể bỏ sót
- Cung cấp đảm bảo mạnh hơn rằng hành vi không thay đổi

**Test Cases**:
1. **Valid match render**: Match có `matchedProfile` hợp lệ render đủ avatar, tên, ngành, timestamp
2. **Click callback**: Click vào match hợp lệ gọi đúng `handleProfileClick` với `StudentProfile` đúng
3. **Load more**: Nút "Xem thêm lịch sử" và logic phân trang hoạt động đúng
4. **Filter blocked**: Blocked users tiếp tục bị filter bỏ
5. **Deduplication**: Dedup logic giữ nguyên sau fix

### Unit Tests

- Test `useMatchingHistory` filter bỏ null/undefined `matchedProfile`
- Test `MatchingHistory` component trả về null cho item không hợp lệ (không crash)
- Test `MatchingHistory` render đúng cho item hợp lệ
- Test guard trong `Matching.tsx` khi `matchedProfile` là null

### Property-Based Tests

- Sinh ngẫu nhiên danh sách `Match[]` với mix hợp lệ/không hợp lệ → verify chỉ items hợp lệ được render
- Sinh ngẫu nhiên các `StudentProfile` hợp lệ → verify tất cả được render đúng và không mất data

### Integration Tests

- Render `MatchingHistory` với list có cả items hợp lệ lẫn không hợp lệ → verify chỉ items hợp lệ xuất hiện
- Click vào match item hợp lệ → verify callback được gọi với đúng profile
- Empty list → verify component trả về null
