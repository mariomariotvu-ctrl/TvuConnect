# Deployment Guide - User Activity Status System

## Prerequisites

- Firebase CLI installed (`npm install -g firebase-tools`)
- Firebase project configured
- Authenticated với Firebase CLI (`firebase login`)

## Step 1: Deploy Database Rules

```bash
firebase deploy --only database
```

**Expected Output:**
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/YOUR_PROJECT/database
```

## Step 2: Verify Rules in Firebase Console

1. Mở Firebase Console
2. Vào **Realtime Database** → **Rules** tab
3. Verify rules đã được deploy đúng

## Step 3: Setup Database Indexes

Vào Firebase Console → Realtime Database → **Data** tab:

1. Click vào "..." menu bên cạnh database root
2. Chọn "Edit Indexes"
3. Thêm indexes:

```json
{
  "rules": {
    "presence": {
      ".indexOn": ["status", "lastActive"]
    }
  }
}
```

## Step 4: Test Rules với Emulator (Optional)

Trước khi deploy production, test với emulator:

```bash
# Start emulator
firebase emulators:start --only database

# Trong terminal khác, chạy tests
npm test -- --grep "presence rules"
```

## Step 5: Initialize Presence Data Structure

Không cần seed data ban đầu. Data sẽ được tạo tự động khi users login.

## Deployment Checklist

- [ ] Database rules deployed (`firebase deploy --only database`)
- [ ] Rules verified trong Firebase Console
- [ ] Indexes configured
- [ ] Rules tested với emulator
- [ ] Permission tests passed
- [ ] onDisconnect() mechanism tested

## Rollback Plan

Nếu có issue sau khi deploy, rollback ngay:

```bash
# Lấy version trước đó
firebase database:get /

# Restore rules cũ
firebase deploy --only database --force
```

## Monitoring

Sau khi deploy, monitor:

1. **Firebase Console → Realtime Database → Usage**
   - Concurrent connections
   - Download/Upload bandwidth
   - Storage used

2. **Firebase Console → Realtime Database → Logs**
   - Permission denied errors
   - Failed writes

## Common Issues

### Issue 1: Permission Denied khi đọc presence
**Cause:** Rules quá strict hoặc user chưa authenticate

**Fix:**
- Verify user đã login (`auth.uid` exists)
- Check privacy settings của target user
- Verify blocked list

### Issue 2: onDisconnect() không trigger
**Cause:** Connection không được setup properly

**Fix:**
```typescript
// Ensure connection ref is kept alive
const connectedRef = ref(db, '.info/connected');
onValue(connectedRef, (snap) => {
  if (snap.val() === true) {
    // Setup onDisconnect here
    onDisconnect(presenceRef).update({...});
  }
});
```

### Issue 3: Slow query performance
**Cause:** Missing indexes

**Fix:**
- Verify indexes đã được configured
- Check Firebase Console warnings về missing indexes

## Security Considerations

⚠️ **IMPORTANT**: 
- Rules chỉ allow authenticated users
- Privacy mode và invisible mode được enforce ở database level
- Blocked users không thể đọc presence data

## Next Deployment

Khi có thay đổi rules:

1. Update `database.rules.json`
2. Test với emulator
3. Deploy: `firebase deploy --only database`
4. Verify in console
5. Monitor logs for errors

## Support

Nếu gặp issue khi deploy:
- Check Firebase Console logs
- Verify authentication setup
- Test rules với emulator trước
