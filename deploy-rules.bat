@echo off
echo ========================================
echo   TVU Connect - Deploy Firestore Rules
echo ========================================
echo.
echo Buoc 1: Dang nhap Firebase...
echo.
powershell -ExecutionPolicy Bypass -Command "firebase login"
echo.
echo Buoc 2: Deploy rules...
echo.
powershell -ExecutionPolicy Bypass -Command "firebase deploy --only firestore:rules"
echo.
echo ========================================
echo   Hoan thanh!
echo ========================================
echo.
echo Bay gio ban co the:
echo 1. Refresh trang TVU Connect (Ctrl + F5)
echo 2. Thu gui tin nhan
echo.
pause
