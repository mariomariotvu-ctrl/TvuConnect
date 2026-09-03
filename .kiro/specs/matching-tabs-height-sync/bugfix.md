# Bugfix Requirements Document

## Introduction

Trong tính năng ghép đôi (matching) của ứng dụng TVU Connect, các tab "Tìm người yêu", "Bạn cùng học", và "Sở thích chung" hiện có chiều cao và khoảng cách padding không đồng bộ, gây ra trải nghiệm giao diện không nhất quán. Cần điều chỉnh padding để các tab có kích thước cân đối và đồng bộ với nhau.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN hiển thị tab "Tìm người yêu" trên desktop THEN tab có `pt-2` (8px padding-top) khiến icon và text quá gần đỉnh card

1.2 WHEN hiển thị tab "Bạn cùng học" trên desktop THEN tab có `pb-1` (4px padding-bottom) trong khi các tab khác có `pb-5` hoặc `pb-1`, tạo sự không đồng nhất

1.3 WHEN hiển thị tab "Sở thích chung" trên desktop THEN tab có `pb-1` (4px padding-bottom) cần giảm thêm để cân đối với các tab khác

### Expected Behavior (Correct)

2.1 WHEN hiển thị tab "Tìm người yêu" trên desktop THEN tab SHALL có padding-top giảm xuống để tạo khoảng cách cân đối hơn với các tab khác

2.2 WHEN hiển thị tab "Bạn cùng học" trên desktop THEN tab SHALL có padding-bottom bằng với các tab "Tìm người yêu" và "Sở thích chung" để đồng bộ

2.3 WHEN hiển thị tab "Sở thích chung" trên desktop THEN tab SHALL có padding-bottom giảm nhẹ để cân đối với các tab khác

### Unchanged Behavior (Regression Prevention)

3.1 WHEN hiển thị tab "Kết nối nhanh" trên desktop THEN tab SHALL CONTINUE TO giữ nguyên chiều cao `h-56` và padding hiện tại

3.2 WHEN hiển thị các tab trên mobile THEN các tab SHALL CONTINUE TO giữ nguyên layout và padding hiện tại

3.3 WHEN click vào các tab THEN chức năng chuyển đổi giữa các mode matching SHALL CONTINUE TO hoạt động bình thường

3.4 WHEN tab bị khóa (profile chưa hoàn thiện) THEN trạng thái disabled và icon 🔒 SHALL CONTINUE TO hiển thị đúng

3.5 WHEN hover vào các tab đã mở khóa THEN hiệu ứng hover (scale, shadow) SHALL CONTINUE TO hoạt động bình thường
