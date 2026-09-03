# Script tự động deploy Firestore Rules
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TVU Connect - Deploy Firestore Rules" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kiểm tra Firebase CLI
Write-Host "Đang kiểm tra Firebase CLI..." -ForegroundColor Yellow
try {
    $version = firebase --version 2>&1
    Write-Host "✓ Firebase CLI đã cài đặt: $version" -ForegroundColor Green
} catch {
    Write-Host "✗ Firebase CLI chưa được cài đặt!" -ForegroundColor Red
    Write-Host "Vui lòng chạy: npm install -g firebase-tools" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Đang deploy Firestore Rules..." -ForegroundColor Yellow
Write-Host ""

# Deploy rules
try {
    firebase deploy --only firestore:rules
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ✓ Deploy thành công!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Bây giờ bạn có thể:" -ForegroundColor Cyan
    Write-Host "1. Refresh trang web TVU Connect (Ctrl + F5)" -ForegroundColor White
    Write-Host "2. Thử gửi tin nhắn" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ✗ Deploy thất bại!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Vui lòng thử deploy thủ công qua Firebase Console:" -ForegroundColor Yellow
    Write-Host "https://console.firebase.google.com/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Hoặc đăng nhập Firebase CLI:" -ForegroundColor Yellow
    Write-Host "firebase login" -ForegroundColor Cyan
    Write-Host ""
}
