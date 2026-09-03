@echo off
chcp 65001 >nul
echo ========================================
echo KHẮC PHỤC MAP CLUSTERING - TVU CONNECT
echo ========================================
echo.
echo Bước 1: Xóa cache Vite...
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
    echo ✅ Đã xóa cache Vite
) else (
    echo ℹ️ Không có cache Vite
)
echo.

echo Bước 2: Cài đặt react-leaflet-cluster...
call npm install react-leaflet-cluster
if %errorlevel% neq 0 (
    echo ❌ Lỗi cài đặt! Thử cách khác...
    echo.
    echo Đang thử với --legacy-peer-deps...
    call npm install react-leaflet-cluster --legacy-peer-deps
)
echo.

echo Bước 3: Kiểm tra cài đặt...
call npm list react-leaflet-cluster
echo.

echo ========================================
echo HOÀN THÀNH!
echo ========================================
echo.
echo 📝 Các bước tiếp theo:
echo    1. Đóng terminal dev server hiện tại (Ctrl+C)
echo    2. Chạy lại: npm run dev
echo    3. Mở trình duyệt và test tab Bản đồ
echo.
echo 🔍 Nếu vẫn lỗi, chạy: fix-clustering-full.bat
echo.
pause
