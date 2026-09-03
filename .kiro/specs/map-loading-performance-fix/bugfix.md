# Bugfix Requirements Document

## Introduction

Trên thiết bị mobile, khi người dùng chuyển sang tab "Bản đồ" trong màn hình Khám phá, ứng dụng bị đơ/lag nghiêm trọng. Màn hình hiển thị thông báo "Đang tải bản đồ... Chuẩn bị 102 địa điểm cho bạn" với progress bar, nhưng việc render đồng thời toàn bộ 102–150 markers cùng với Leaflet map khiến main thread của thiết bị mobile bị tắc nghẽn, gây treo giao diện.

Nguyên nhân cốt lõi là `PLACES_MOBILE = 150` và `visibleMarkers = 100` được set ngay lập tức — toàn bộ markers được tạo và inject vào DOM trong một lần duy nhất thay vì tải dần từng batch nhỏ.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN người dùng tap vào tab "Bản đồ" trên thiết bị mobile THEN hệ thống render đồng thời toàn bộ 100+ markers Leaflet lên canvas trong một frame duy nhất, gây block main thread và đơ giao diện trong 2–5 giây

1.2 WHEN MapView component được mount THEN hệ thống query Firestore với `limit(150)` trên mobile và tải toàn bộ 150 địa điểm về bộ nhớ ngay lập tức, gây tốn RAM và tăng thời gian parse data trên thiết bị yếu

1.3 WHEN tab "Bản đồ" được kích hoạt lần đầu THEN hệ thống tạo toàn bộ SVG icon objects cho 15 categories (batch icon creation trong `iconCache`) đồng thời trong một lần render, gây giật lag khi khởi tạo

1.4 WHEN bản đồ đang trong trạng thái loading (`!isMapReady`) THEN hệ thống vẫn hiển thị badge "Chuẩn bị {nearbyPlaces.length} địa điểm" với số lượng toàn bộ địa điểm đã tải, tạo cảm giác ứng dụng cần xử lý quá nhiều dữ liệu cùng lúc

### Expected Behavior (Correct)

2.1 WHEN người dùng tap vào tab "Bản đồ" trên thiết bị mobile THEN hệ thống SHALL render markers theo từng batch nhỏ (progressive rendering), hiển thị từ 20–30 markers đầu tiên trong frame đầu tiên và thêm dần các markers còn lại qua `requestAnimationFrame` hoặc `setTimeout`, không block main thread

2.2 WHEN MapView component được mount trên mobile THEN hệ thống SHALL chỉ query Firestore với giới hạn thấp hơn cho tab "Bản đồ" (ví dụ: 30–50 địa điểm gần nhất trong vùng hiển thị thực tế), không tải toàn bộ 150 bản ghi một lúc

2.3 WHEN tab "Bản đồ" được kích hoạt lần đầu THEN hệ thống SHALL tạo icon objects theo lazy/on-demand (chỉ tạo icon cho category có địa điểm sẽ hiển thị), hoặc trì hoãn việc tạo icon cache cho đến sau khi bản đồ đã render xong frame đầu tiên

2.4 WHEN bản đồ đang trong trạng thái loading trên mobile THEN hệ thống SHALL hiển thị thông báo loading nhẹ nhàng không đề cập số lượng địa điểm cụ thể, tránh tạo áp lực xử lý ngay lập tức

### Unchanged Behavior (Regression Prevention)

3.1 WHEN người dùng sử dụng tab "Địa điểm" (list view) THEN hệ thống SHALL CONTINUE TO hiển thị toàn bộ danh sách địa điểm với đầy đủ thông tin, filter theo category và khoảng cách hoạt động bình thường

3.2 WHEN người dùng tap vào một marker trên bản đồ THEN hệ thống SHALL CONTINUE TO hiển thị PlaceInfoBottomSheet với thông tin địa điểm đầy đủ

3.3 WHEN người dùng truy cập từ thiết bị desktop (viewport ≥ 768px) THEN hệ thống SHALL CONTINUE TO tải bản đồ với `PLACES_DESKTOP = 300` và render toàn bộ markers bình thường không bị ảnh hưởng

3.4 WHEN người dùng scroll hoặc zoom bản đồ THEN hệ thống SHALL CONTINUE TO cập nhật `displayPlaces` theo `mapBounds` và re-render markers trong vùng hiển thị mới

3.5 WHEN người dùng filter theo category THEN hệ thống SHALL CONTINUE TO lọc markers đúng theo category được chọn và cập nhật badge số lượng địa điểm

3.6 WHEN người dùng thực hiện check-in hoặc tạo sự kiện THEN hệ thống SHALL CONTINUE TO hiển thị modal check-in và sự kiện hoạt động đầy đủ

---

## Bug Condition (Pseudocode)

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = { isMobile: boolean, activeTab: TabMode, placesCount: number }
  OUTPUT: boolean

  RETURN X.isMobile = true
    AND X.activeTab = 'map'
    AND X.placesCount > 50
    AND renderMode = 'all-at-once'  // visibleMarkers set to 100 immediately
END FUNCTION
```

### Property: Fix Checking

```pascal
// Property: Fix Checking — Progressive Marker Rendering
FOR ALL X WHERE isBugCondition(X) DO
  result ← renderMapTab'(X)
  ASSERT markersInFirstFrame(result) <= 30
    AND totalRenderTime(result) < 500ms
    AND mainThreadBlockDuration(result) < 100ms
    AND noJank(result) = true
END FOR
```

### Property: Preservation Checking

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT behavior_after_fix(X) = behavior_before_fix(X)
  // Đặc biệt: desktop (isMobile=false) KHÔNG bị ảnh hưởng
END FOR
```
