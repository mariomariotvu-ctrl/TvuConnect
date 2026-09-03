# Tasks

- [x] 1. Tạo component MatchingHistorySection
  - Tạo file `src/components/matching/MatchingHistorySection.tsx`
  - Implement sub-component `MatchedProfileCard` trong cùng file:
    - Guard: nếu `match.matchedProfile` là null → trả về null
    - Avatar với onError fallback sang UserIcon
    - Tên, ngành (fallback "Chưa cập nhật"), ngày ghép dd/MM/yyyy (fallback "Không rõ ngày")
    - Nút "Nhắn tin" (MessageSquare icon) — ẩn nếu !onStartChat hoặc !uid
  - Implement `MatchingHistorySection`:
    - Props: `matches`, `hasMoreHistory`, `loadMore`, `isLoading`, `error`, `onStartChat?`
    - Loading state: 3 skeleton item `animate-pulse bg-gray-100 rounded-[20px] h-[72px]`
    - Error state: banner `bg-red-50 text-red-600 rounded-2xl` với text "Không thể tải lịch sử ghép. Vui lòng thử lại sau."
    - Empty state: icon + "Chưa có hồ sơ nào được ghép"
    - Data state: danh sách `MatchedProfileCard` + nút "Xem thêm" khi `hasMoreHistory === true`
    - Header: icon `History`, tiêu đề "Hồ sơ đã ghép", mô tả "Xem lại và nhắn tin với những người đã ghép trước đó"
  - _Requirements: 1, 2, 3, 4, 5, 7_

- [ ] 2. Tích hợp MatchingHistorySection vào Matching.tsx
  - Thêm prop `onStartChat?: (uid: string) => void` vào `MatchingProps` interface
  - Import `MatchingHistorySection`
  - Destructure thêm `isLoading` và `error: historyError` từ `useMatchingHistory` (tránh conflict với `error` từ `useCachedMatching`)
  - Thêm conditional render sau Daily_Limit_Banner:
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
  - _Requirements: 1, 6, 8_
  - _Requires: 1_
