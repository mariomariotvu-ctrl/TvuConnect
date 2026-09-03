# ✅ Checklist Chuyển Sang Project Mới

## ✅ Đã Xong

- [x] Tạo file `.env.local` với Firebase config mới
- [x] Project ID: `tvu-connect-1dc97`

---

## 📋 Còn Phải Làm

### 1. Bật Services Trong Firebase Console

Vào https://console.firebase.google.com/project/tvu-connect-1dc97

#### 1.1. Firestore Database
- Build → **Firestore Database** → **Create database**
- Chọn **Start in test mode**
- Location: **asia-southeast1** (Singapore)
- Click **Enable**

#### 1.2. Authentication  
- Build → **Authentication** → **Get started**
- Tab **Sign-in method** → Bật **Google**
  - Toggle Enable → Chọn email support → Save

#### 1.3. Storage
- Build → **Storage** → **Get started**
- Chọn **Start in test mode**
- Location: **asia-southeast1**
- Click **Done**

---

### 2. Test App

```bash
npm run dev
```

Mở http://localhost:3000 → thử đăng nhập bằng Google

---

### 3. Deploy Rules & App

```bash
# Deploy Firestore & Storage rules
firebase use tvu-connect-1dc97
firebase deploy --only firestore:rules,storage

# Build & deploy app
npm run build
firebase deploy
```

---

## ⚠️ Lưu Ý

- **Dữ liệu cũ không được chuyển** — project mới bắt đầu từ trống
- **Users phải đăng ký lại** — không có data cũ
- File `.env.local` đã chứa config mới, **không commit** lên Git
- Xóa file Service Account sau khi xong: `scripts/source-service-account.json`
