@echo off
chcp 65001 >nul
echo ========================================
echo KHẮC PHỤC TOÀN DIỆN - MAP CLUSTERING
echo ========================================
echo.
echo ⚠️ CẢNH BÁO: Script này sẽ xóa node_modules
echo    và cài lại tất cả packages (mất 2-3 phút)
echo.
pause
echo.

echo Bước 1: Xóa node_modules và cache...
if exist "node_modules" (
    echo Đang xóa node_modules... (có thể mất 1-2 phút)
    rmdir /s /q "node_modules"
    echo ✅ Đã xóa node_modules
)
if exist "package-lock.json" (
    del /f /q "package-lock.json"
    echo ✅ Đã xóa package-lock.json
)
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
    echo ✅ Đã xóa cache Vite
)
echo.

echo Bước 2: Cài lại tất cả packages...
echo (Mất khoảng 2-3 phút, vui lòng chờ...)
call npm install
if %errorlevel% neq 0 (
    echo ❌ Lỗi npm install!
    pause
    exit /b 1
)
echo ✅ Đã cài xong packages cơ bản
echo.

echo Bước 3: Cài react-leaflet-cluster...
call npm install react-leaflet-cluster
if %errorlevel% neq 0 (
    echo ⚠️ Thử với --legacy-peer-deps...
    call npm install react-leaflet-cluster --legacy-peer-deps
)
echo.

echo Bước 4: Kiểm tra cài đặt...
call npm list react-leaflet-cluster
echo.

echo ========================================
echo HOÀN THÀNH!
echo ========================================
echo.
echo 📝 Bây giờ hãy:
echo    1. Chạy: npm run dev
echo    2. Mở trình duyệt: http://localhost:3000
echo    3. Test tab Khám phá → Bản đồ
echo.
echo ✅ Nếu thấy markers gom cụm khi zoom out = THÀNH CÔNG!
echo.
pause
