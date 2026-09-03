# Firebase Realtime Database Setup - User Activity Status

## Database Structure

```
/presence/{userId}/
  ├─ status: "online" | "away" | "offline"
  ├─ lastActive: timestamp (number)
  ├─ connections/
  │   └─ {connectionId}/
  │       ├─ device: "web" | "mobile" | "desktop"
  │       ├─ timestamp: number
  │       └─ userAgent?: string
  └─ settings/
      ├─ privacyMode: boolean
      └─ invisibleMode: boolean
```

## Security Rules

File `database.rules.json` đã được tạo với các quy tắc sau:

### Read Rules
- User chỉ có thể đọc status của chính mình
- User có thể đọc status của người khác NẾU:
  - Người đó KHÔNG bật invisible mode
  - Người đó KHÔNG bật privacy mode HOẶC là bạn bè
  - User KHÔNG bị blocked bởi người đó

### Write Rules
- User chỉ có thể write presence data của chính mình
- Yêu cầu authentication (auth.uid === $userId)

### Validation Rules
- **status**: Phải là string và có giá trị 'online', 'away', hoặc 'offline'
- **lastActive**: Phải là number và <= thời gian hiện tại
- **connections.device**: Phải là 'web', 'mobile', hoặc 'desktop'
- **connections.timestamp**: Phải là number và <= thời gian hiện tại
- **settings**: privacyMode và invisibleMode phải là boolean

## Database Indexes

Để tối ưu query performance, cần thiết lập các indexes sau trong Firebase Console:

### Index 1: Query Online Users
```json
{
  "presence": {
    ".indexOn": ["status", "lastActive"]
  }
}
```

## onDisconnect() Mechanism

Firebase Realtime Database cung cấp `onDisconnect()` API để tự động cập nhật data khi connection bị mất:

```typescript
import { getDatabase, ref, onDisconnect, serverTimestamp } from 'firebase/database';

const db = getDatabase();
const userPresenceRef = ref(db, `presence/${userId}`);

// Setup auto-offline khi disconnect
onDisconnect(userPresenceRef).update({
  status: 'offline',
  lastActive: serverTimestamp()
});
```

## Setup Steps

### 1. Deploy Security Rules

Chạy lệnh sau để deploy rules:

```bash
firebase deploy --only database
```

### 2. Setup Indexes trong Firebase Console

1. Mở Firebase Console → Realtime Database
2. Vào tab "Rules"
3. Thêm indexes vào phần `.indexOn`

### 3. Verify Rules

Test rules bằng Firebase Emulator:

```bash
firebase emulators:start --only database
```

## Testing Rules

### Test Read Permission

```javascript
// Test: User có thể đọc presence của chính mình
const userRef = ref(db, `presence/${currentUserId}`);
await get(userRef); // ✓ Should succeed

// Test: User không thể đọc presence của người bật invisible mode
const invisibleUserRef = ref(db, `presence/invisibleUserId`);
await get(invisibleUserRef); // ✗ Should fail
```

### Test Write Permission

```javascript
// Test: User có thể write presence của chính mình
const userRef = ref(db, `presence/${currentUserId}`);
await set(userRef, {
  status: 'online',
  lastActive: Date.now()
}); // ✓ Should succeed

// Test: User không thể write presence của người khác
const otherUserRef = ref(db, `presence/otherUserId`);
await set(otherUserRef, {
  status: 'online'
}); // ✗ Should fail
```

## Error Handling

### Permission Denied Error
```typescript
try {
  await get(userStatusRef);
} catch (error) {
  if (error.code === 'PERMISSION_DENIED') {
    console.log('User không có quyền đọc status này');
    // Return default offline status
    return { status: 'offline' };
  }
}
```

### Network Error
```typescript
try {
  await set(presenceRef, newData);
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    console.log('Mất kết nối. Sẽ retry...');
    // Queue update locally
  }
}
```

## Next Steps

Sau khi setup database xong, tiếp tục với:
- Task 2: Implement Activity Detector Hook
- Task 3: Implement Status Manager
- Task 5-6: Implement UI Components

## Requirements Validated

Task này validate các requirements sau:
- **Req 4.2**: Firebase Realtime Database presence system
- **Req 4.3**: Auto-offline với onDisconnect()
- **Req 6.3**: Authentication required cho writes
- **Req 6.4**: Unauthorized read denial
