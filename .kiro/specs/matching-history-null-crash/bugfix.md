# Bugfix Requirements Document

## Introduction

Lỗi `TypeError: undefined is not an object (evaluating 'e.matchedProfile.photoURL')` xảy ra trên mobile khi component `MatchingHistory` cố gắng render một `Match` document từ Firestore mà field `matchedProfile` bị thiếu, `null`, hoặc `undefined`. Nguyên nhân là do dữ liệu cũ trong Firestore hoặc race condition khi ghi — dẫn đến một số documents không có `matchedProfile` đầy đủ. Lỗi này crash toàn bộ trang ghép cặp trên mobile, ảnh hưởng đến trải nghiệm người dùng.

## Bug Analysis

### Current Behavior (Defect)

Khi `useMatchingHistory` map Firestore documents sang `Match` objects, tất cả documents — kể cả những document thiếu `matchedProfile` — đều được đưa vào state mà không có bất kỳ kiểm tra nào.

1.1 WHEN Firestore trả về một `Match` document có `matchedProfile` là `undefined` hoặc `null` THEN `useMatchingHistory` vẫn đưa document đó vào `matchHistory` array

1.2 WHEN `MatchingHistory` render một item có `match.matchedProfile` là `undefined` THEN hệ thống crash với lỗi `TypeError: undefined is not an object (evaluating 'e.matchedProfile.photoURL')`

1.3 WHEN `MatchingHistory` render một item có `match.matchedProfile` là `undefined` THEN hệ thống crash khi truy cập `match.matchedProfile.fullName`

1.4 WHEN `MatchingHistory` render một item có `match.matchedProfile` là `undefined` THEN hệ thống crash khi truy cập `match.matchedProfile.major`

1.5 WHEN người dùng click vào một match item trong lịch sử và `match.matchedProfile` là `undefined` THEN `Matching.tsx` gọi `handleProfileClick(undefined)` gây ra lỗi runtime

### Expected Behavior (Correct)

2.1 WHEN `useMatchingHistory` nhận Firestore documents THEN hệ thống SHALL lọc bỏ (filter out) tất cả documents có `matchedProfile` là `undefined`, `null`, hoặc thiếu field trước khi đưa vào state

2.2 WHEN `MatchingHistory` nhận một `match` có `match.matchedProfile` là falsy THEN hệ thống SHALL bỏ qua (skip) việc render item đó mà không crash

2.3 WHEN `MatchingHistory` render một `match` có `match.matchedProfile` hợp lệ THEN hệ thống SHALL hiển thị `photoURL`, `fullName`, `major` như bình thường

2.4 WHEN `Matching.tsx` nhận callback `onProfileClick` với một `match` THEN hệ thống SHALL chỉ gọi `handleProfileClick(match.matchedProfile)` nếu `match.matchedProfile` tồn tại và không phải `null/undefined`

2.5 WHEN interface `Match` trong `types.ts` được cập nhật THEN hệ thống SHALL khai báo `matchedProfile` là optional (`matchedProfile?: StudentProfile | null`) để phản ánh đúng thực tế dữ liệu từ Firestore

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `match.matchedProfile` tồn tại và hợp lệ THEN hệ thống SHALL CONTINUE TO render avatar, tên, ngành học, và timestamp đúng như trước

3.2 WHEN người dùng click vào một match item hợp lệ (có `matchedProfile`) THEN hệ thống SHALL CONTINUE TO gọi `handleProfileClick` và mở profile của người đó

3.3 WHEN `useMatchingHistory` nhận các Firestore documents hợp lệ (đủ `matchedProfile`) THEN hệ thống SHALL CONTINUE TO lọc blocked users, deduplicate, và phân trang như trước

3.4 WHEN `matchHistory` không có item nào THEN hệ thống SHALL CONTINUE TO trả về `null` (không render component)

3.5 WHEN nhấn nút "Xem thêm lịch sử" THEN hệ thống SHALL CONTINUE TO tải thêm matches từ Firestore như trước
