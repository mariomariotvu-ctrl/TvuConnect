@echo off
echo ========================================
echo   DEPLOY FIRESTORE RULES - CMD VERSION
echo ========================================
echo.
echo Dang deploy Firestore rules...
echo.

firebase deploy --only firestore:rules

echo.
echo ========================================
if %ERRORLEVEL% EQU 0 (
    echo   THANH CONG! Rules da duoc deploy.
    echo.
    echo   Buoc tiep theo:
    echo   1. Refresh trang web ^(Ctrl + Shift + R^)
    echo   2. Click nut "Them 10 dia diem mau"
    echo   3. Refresh lai va enjoy!
) else (
    echo   LOI! Khong the deploy rules.
    echo.
    echo   Hay thu:
    echo   1. Chay: firebase login --reauth
    echo   2. Chay lai file nay
    echo.
    echo   Hoac deploy qua Firebase Console:
    echo   https://console.firebase.google.com/
)
echo ========================================
echo.
pause
