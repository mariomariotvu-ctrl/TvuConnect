# Hướng Dẫn Lấy Thông Tin Migration

## 📋 Tổng Quan - Bạn Cần Lấy Gì?

| Thông tin | Mục đích | Thời gian |
|-----------|----------|-----------|
| **Service Account Keys** (2 files) | Cho phép script truy cập Firebase | 5 phút |
| **Project IDs** | Xác định project nguồn và đích | 1 phút |
| **Firebase Config** | Cập nhật app sau migration | 3 phút |

---

## 🔑 BƯỚC 1: Lấy Service Account Keys

### Project CŨ (Source)

1. **Mở Firebase Console**
   ```
   https://console.firebase.google.com
   ```

2. **Chọn project CŨ** (project hiện tại đang dùng)

3. **Vào Settings**
   - Click vào icon bánh răng ⚙️ bên trái
   - Chọn **Project settings**

4. **Service accounts tab**
   - Click tab **Service accounts** (ở giữa màn hình)
   - Kéo xuống phần **Firebase Admin SDK**

5. **Generate key**
   - Click nút **Generate new private key**
   - Popup xác nhận → Click **Generate key**
   - File JSON sẽ tự động download

6. **Đổi tên file**
   - File download có tên dài: `projectname-firebase-adminsdk-xxxxx.json`
   - Đổi tên thành: **`source-service-account.json`**
   - Di chuyển vào thư mục `d:\tvu-connect\scripts\`

---

### Project MỚI (Target)

**LẶP LẠI** các bước trên nhưng với project MỚI:

1. Quay lại Firebase Console trang chủ
2. **Tạo project mới** (hoặc chọn project có sẵn)
   - Click **Add project**
   - Nhập tên project (ví dụ: `tvu-connect-new`)
   - Bật Google Analytics (optional)
   - Click **Create project**

3. Sau khi tạo xong, vào **Project settings** → **Service accounts**
4. Click **Generate new private key**
5. Đổi tên file thành: **`target-service-account.json`**
6. Đặt vào `d:\tvu-connect\scripts\`

---

## 🎯 BƯỚC 2: Lấy Project IDs

### Cách 1: Từ Firebase Console
- Project Settings → General → **Project ID** (dòng đầu tiên)

### Cách 2: Từ file Service Account vừa download
- Mở file JSON bằng Notepad
- Tìm dòng `"project_id": "xxxxx"`

**Ví dụ:**
```json
{
  "project_id": "tvu-connect-prod",  // ← Đây là Project ID
  "private_key_id": "abc123...",
  ...
}
```

Ghi chú lại 2 Project IDs:
- **Source (cũ):** `_________________`
- **Target (mới):** `_________________`

---

## 🔧 BƯỚC 3: Bật Services Trong Project Mới

Vào Firebase Console của **project MỚI**, bật các dịch vụ:

### 3.1. Firestore Database
1. Build → **Firestore Database**
2. Click **Create database**
3. Chọn **Start in test mode** (tạm thời)
4. Chọn location: **asia-southeast1** (Singapore)
5. Click **Enable**

### 3.2. Authentication
1. Build → **Authentication**
2. Click **Get started**
3. Tab **Sign-in method**
4. Bật **Google** sign-in:
   - Click vào Google
   - Toggle **Enable**
   - Chọn email hỗ trợ
   - Click **Save**

### 3.3. Storage
1. Build → **Storage**
2. Click **Get started**
3. Chọn **Start in test mode**
4. Chọn location: **asia-southeast1**
5. Click **Done**

---

## 📝 BƯỚC 4: Lấy Firebase Config (Cho App)

**SAU KHI** migration xong, bạn cần cập nhật config trong app:

1. Firebase Console → **Project settings**
2. Tab **General** → kéo xuống phần **Your apps**
3. Nếu chưa có Web app:
   - Click icon **</>** (Web)
   - Nhập nickname: `TVU Connect`
   - Click **Register app**

4. Copy các giá trị sau:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",           // ← VITE_FIREBASE_API_KEY
  authDomain: "xxx.firebaseapp.com",  // ← VITE_FIREBASE_AUTH_DOMAIN
  projectId: "xxx",            // ← VITE_FIREBASE_PROJECT_ID
  storageBucket: "xxx.appspot.com",   // ← VITE_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "123456", // ← VITE_FIREBASE_MESSAGING_SENDER_ID
  appId: "1:123456:web:abc"    // ← VITE_FIREBASE_APP_ID
};
```

**Lưu lại** các giá trị này, sẽ dùng khi CLI hỏi.

---

## ✅ Checklist Trước Khi Chạy Migration

- [ ] Đã tạo project Firebase MỚI
- [ ] Đã bật Firestore, Authentication (Google), Storage trong project MỚI
- [ ] Có 2 files trong `scripts/`:
  - [ ] `source-service-account.json`
  - [ ] `target-service-account.json`
- [ ] Biết Project ID của cả 2 projects
- [ ] Đã ghi chú Firebase config của project MỚI

---

## 🚀 Bây Giờ Chạy Migration

```bash
node scripts/setup-migration.js
```

Script sẽ hỏi từng thông tin, bạn chỉ cần paste giá trị đã chuẩn bị.

---

## ⚠️ LƯU Ý QUAN TRỌNG

### Bảo Mật
- **KHÔNG** commit 2 file `*-service-account.json` lên Git
- **XÓA** 2 file này sau khi migration xong
- File chứa private key có thể truy cập toàn bộ Firebase project

### Giới Hạn
- **Password** của users KHÔNG được copy (Firebase security policy)
- Users cần đăng nhập lại bằng Google (app của bạn dùng Google Auth nên OK)
- **URL ảnh** trong Firestore vẫn trỏ Storage bucket cũ sau khi copy

### Firestore Rules
Sau migration, nhớ deploy rules:
```bash
firebase use target-project-id
firebase deploy --only firestore:rules,storage
```

---

## 🆘 Cần Trợ Giúp?

### File Service Account tải về tên dài quá?
→ Chuột phải file → Rename → đổi thành `source-service-account.json`

### Không tìm thấy "Generate new private key"?
→ Kiểm tra bạn có quyền Owner/Editor của project chưa

### Project mới không cho tạo Firestore?
→ Kiểm tra billing đã được bật chưa (cần thẻ tín dụng)

### Migration mất bao lâu?
- Dưới 1000 documents: ~5 phút
- 1000-10,000 documents: ~15-30 phút  
- 10,000+ documents: ~1-2 giờ

---

## 📸 Screenshot Tham Khảo

### Vị trí "Generate new private key"
```
Firebase Console → ⚙️ Project Settings → Service accounts tab
                    ↓
[Firebase Admin SDK]
  ↓
[Generate new private key] ← Click đây
```

### Vị trí Firebase Config
```
Firebase Console → ⚙️ Project Settings → General tab
                    ↓
Kéo xuống phần "Your apps"
  ↓
[</>] Web app → [Config] ← Copy đoạn này
```
