# Firebase Migration Scripts

## 🚀 Cách Dùng Nhanh

### Option 1: CLI Tự Động (Khuyến Nghị) ✨

```bash
node scripts/setup-migration.js
```

CLI sẽ hướng dẫn từng bước:
1. ✅ Kiểm tra + cài Firebase CLI
2. ✅ Đăng nhập Firebase
3. ✅ Liệt kê projects
4. ✅ Hướng dẫn download Service Account keys
5. ✅ Cài dependencies
6. ✅ Chạy migration
7. ✅ Cập nhật .env file
8. ✅ Dọn dẹp files nhạy cảm

---

### Option 2: Thủ Công

1. **Chuẩn bị Service Account keys:**
   - Download từ Firebase Console
   - Đổi tên: `source-service-account.json` và `target-service-account.json`
   - Đặt vào `scripts/`

2. **Cài dependencies:**
   ```bash
   npm install firebase-admin --save-dev
   ```

3. **Chạy migration:**
   ```bash
   node scripts/migrate-firebase.js
   ```

4. **Xem hướng dẫn chi tiết:**
   Đọc file `MIGRATION_GUIDE.md`

---

## 📁 Files

| File | Mô tả |
|------|-------|
| `setup-migration.js` | CLI tương tác setup tự động |
| `migrate-firebase.js` | Script migration chính |
| `MIGRATION_GUIDE.md` | Hướng dẫn chi tiết từng bước |

---

## ⚠️ Lưu Ý

- **Backup dữ liệu** trước khi chạy
- **Không commit** các file `*-service-account.json` lên Git
- **Xóa** các file service account sau khi migration xong
- Migration có thể mất **vài phút đến vài giờ** tuỳ lượng dữ liệu

---

## 🐛 Troubleshooting

### Lỗi "Firebase CLI not found"
```bash
npm install -g firebase-tools
```

### Lỗi "Permission denied"
→ Tạm set Firestore Rules `allow read, write: if true;` khi test

### Lỗi "Module not found: firebase-admin"
```bash
npm install firebase-admin --save-dev
```

### User không đăng nhập được sau migration
→ Password không được copy (Firebase security). Users dùng Google Sign-In hoặc reset password.
