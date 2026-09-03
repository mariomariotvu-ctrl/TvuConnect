# Hướng Dẫn Chuyển Firebase Sang Project Mới

## Chuẩn Bị

### Bước 1: Tạo project Firebase mới
1. Truy cập [Firebase Console](https://console.firebase.google.com)
2. Tạo project mới
3. Bật **Firestore**, **Authentication (Google)**, **Storage**
4. Copy Firebase config sang `.env` file mới

---

### Bước 2: Lấy Service Account Keys

**Project CŨ (source):**
1. Firebase Console → Project Settings (⚙️)
2. Service accounts → Generate new private key
3. Download file → đổi tên thành `source-service-account.json`
4. Đặt vào thư mục `scripts/`

**Project MỚI (target):**
1. Firebase Console → Project Settings (⚙️)
2. Service accounts → Generate new private key
3. Download file → đổi tên thành `target-service-account.json`
4. Đặt vào thư mục `scripts/`

> ⚠️ **QUAN TRỌNG**: KHÔNG commit 2 file này lên Git. Xóa sau khi migration xong!

---

### Bước 3: Cài firebase-admin

```bash
npm install firebase-admin --save-dev
```

---

## Chạy Migration

```bash
node scripts/migrate-firebase.js
```

Script sẽ tự động migrate:
- ✅ Tất cả Firestore collections (profiles, posts, messages, matches, ...)
- ✅ Authentication users
- ✅ Storage files (ảnh, audio)

**Thời gian ước tính:**
- Dưới 1000 documents: ~5 phút
- 1000–10,000 documents: ~15-30 phút
- Trên 10,000 documents: ~1-2 giờ

---

## Sau Migration

### Bước 4: Cập nhật Firebase config trong app

Mở file `.env.local` và thay bằng config của project MỚI:

```env
VITE_FIREBASE_API_KEY=your_new_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_new_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_new_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_new_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_new_sender_id
VITE_FIREBASE_APP_ID=your_new_app_id
```

### Bước 5: Cập nhật Firebase security rules

Vào Firebase Console của project MỚI:
- **Firestore Rules**: Copy nội dung từ `firestore.rules`
- **Storage Rules**: Copy rules storage hiện tại

```bash
# Deploy rules (nếu dùng Firebase CLI)
firebase use --add    # thêm project mới
firebase deploy --only firestore:rules,storage
```

### Bước 6: Cập nhật `.firebaserc`

```json
{
  "projects": {
    "default": "your_new_project_id"
  }
}
```

### Bước 7: Deploy app lên project mới

```bash
firebase use your_new_project_id
npm run build
firebase deploy
```

---

## Kiểm Tra Sau Migration

1. **Test đăng nhập**: Thử đăng nhập bằng Google
2. **Test chat**: Gửi tin nhắn thử
3. **Test matching**: Thử ghép cặp
4. **Kiểm tra ảnh**: Avatar và ảnh bài viết hiển thị đúng
5. **Test notifications**: Xem thông báo có hoạt động không

---

## Troubleshooting

### Lỗi "Permission denied"
→ Kiểm tra Firestore Rules của project mới — tạm thời set `allow read, write: if true;` khi test

### Lỗi "Storage bucket not found"
→ Bật Storage trong Firebase Console của project mới trước

### User không đăng nhập được
→ Authentication users được copy nhưng **password không được copy** (Firebase không cho phép vì lý do bảo mật). Users cần dùng Google Sign-In hoặc reset password.

### Ảnh không hiển thị
→ Storage files đã copy nhưng URL trong Firestore vẫn trỏ project cũ. Cần update URLs trong documents sau migration.

---

## Xóa File Nhạy Cảm

```bash
del scripts\source-service-account.json
del scripts\target-service-account.json
```
