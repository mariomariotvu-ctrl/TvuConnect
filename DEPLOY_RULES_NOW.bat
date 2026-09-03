@echo off
echo ========================================
echo DEPLOY FIRESTORE RULES
echo ========================================
echo.
echo Dang deploy Firestore rules...
echo.

call firebase deploy --only firestore:rules

echo.
echo ========================================
echo HOAN THANH!
echo ========================================
echo.
echo Hay refresh trang web (Ctrl + R) de xem ket qua
echo.
pause
