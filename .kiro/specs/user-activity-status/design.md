# Design Document - User Activity Status System

## Overview

Hệ thống User Activity Status cung cấp khả năng theo dõi và hiển thị trạng thái hoạt động của người dùng (online/away/offline) theo thời gian thực. Hệ thống được thiết kế dựa trên Firebase Realtime Database presence system kết hợp với activity detection thông minh, đảm bảo hiệu suất cao và UX/UI tương tự Facebook.

### Key Design Principles

1. **Real-time First**: Sử dụng Firebase Realtime Database với onDisconnect() để đảm bảo status được cập nhật ngay cả khi connection bị mất
2. **Performance Optimized**: Throttling và debouncing để giảm số lượng database writes
3. **Battery Conscious**: Giảm frequency khi detect battery thấp trên mobile
4. **Multi-device Support**: Xử lý đúng trường hợp người dùng online trên nhiều devices
5. **Privacy Aware**: Tôn trọng privacy settings và blocked users

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Activity Detector  │  Status UI Components  │  Privacy     │
│  (throttled events) │  (indicators, text)    │  Controller  │
└──────────┬──────────┴────────────┬───────────┴──────┬───────┘
           │                       │                   │
           v                       v                   v
┌─────────────────────────────────────────────────────────────┐
│                     Status Manager                           │
│  - State machine (online/away/offline)                      │
│  - Multi-tab coordination                                   │
│  - Timestamp management                                     │
└──────────┬──────────────────────────────────────────────────┘
           │
           v
┌─────────────────────────────────────────────────────────────┐
│              Firebase Realtime Database Layer                │
│                                                              │
│  /presence/{userId}/                                        │
│    ├─ status: "online" | "away" | "offline"               │
│    ├─ lastActive: timestamp                                │
│    ├─ connections/                                         │
│    │   ├─ {connectionId1}: { device, timestamp }          │
│    │   └─ {connectionId2}: { device, timestamp }          │
│    └─ settings/                                            │
│        ├─ privacyMode: boolean                            │
│        └─ invisibleMode: boolean                          │
│                                                              │
│  Security Rules: Authentication + Privacy checks            │
└─────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
User Activity
    │
    ├──> Activity Detector (throttled 30s)
    │         │
    │         v
    │    Update lastActivity timestamp in memory
    │         │
    │         v
    │    Status Manager checks state
    │         │
    ├─────────┴─────── No change? ──> Skip update
    │                       │
    │                      Yes
    │                       │
    │                       v
    │              Debounced Database Write
    │                       │
    │                       v
    │           Firebase Realtime Database
    │                       │
    │                       v
    │              onValue() listeners fire
    │                       │
    │                       v
    │            Update all connected clients
    │                       │
    │                       v
    │              UI Components re-render
    │                       │
    └───────────────────> Status Indicator updates
```

## Components and Interfaces

### 1. Activity Detector (`useActivityDetector.ts`)

Phát hiện hoạt động của người dùng qua events.

```typescript
interface ActivityDetectorConfig {
  throttleMs: number;        // Default: 30000 (30s)
  events: string[];          // ['mousemove', 'keydown', 'touchstart', 'click']
  multiTabSync: boolean;     // Default: true
}

interface ActivityDetectorHook {
  lastActivity: number;      // Timestamp of last activity
  isActive: boolean;         // Current activity state
  resetActivity: () => void; // Manual reset
}

function useActivityDetector(config?: ActivityDetectorConfig): ActivityDetectorHook
```

**Implementation Details:**
- Sử dụng `throttle` từ lodash hoặc custom implementation
- Listen các events: `mousemove`, `keydown`, `keypress`, `click`, `touchstart`, `touchmove`, `scroll`
- Dùng localStorage event để sync activity across tabs
- Cleanup listeners khi component unmount

### 2. Status Manager (`userStatusManager.ts`)

Quản lý state machine và sync với Firebase.

```typescript
type UserStatus = 'online' | 'away' | 'offline';

interface StatusConfig {
  idleThresholdMs: number;    // Default: 300000 (5 min)
  offlineThresholdMs: number; // Default: 900000 (15 min)
  updateDebounceMs: number;   // Default: 30000 (30s)
}

interface UserPresence {
  status: UserStatus;
  lastActive: number;
  connections: Record<string, ConnectionInfo>;
  settings: {
    privacyMode: boolean;
    invisibleMode: boolean;
  };
}

interface ConnectionInfo {
  device: string;      // 'web', 'mobile', 'desktop'
  timestamp: number;
  userAgent?: string;
}

class StatusManager {
  constructor(userId: string, config?: StatusConfig);
  
  // Initialize presence tracking
  initialize(): Promise<void>;
  
  // Update status based on activity
  updateActivity(): void;
  
  // Manually set status
  setStatus(status: UserStatus): Promise<void>;
  
  // Enable/disable invisible mode
  setInvisibleMode(enabled: boolean): Promise<void>;
  
  // Cleanup on disconnect
  destroy(): void;
  
  // Get current connection ID
  getConnectionId(): string;
}
```

**State Machine:**
```
         Activity
    ┌─────────────────┐
    │                 │
    v                 │
[ONLINE] ──5min──> [AWAY] ──15min──> [OFFLINE]
    ^                 │                    │
    │                 │                    │
    └─────Activity────┴────────Activity────┘
```

**Firebase Structure:**
```javascript
{
  "presence": {
    "user123": {
      "status": "online",
      "lastActive": 1234567890000,
      "connections": {
        "conn_abc": {
          "device": "web",
          "timestamp": 1234567890000,
          "userAgent": "Mozilla/5.0..."
        }
      },
      "settings": {
        "privacyMode": false,
        "invisibleMode": false
      }
    }
  }
}
```

### 3. Status Indicator Component (`StatusIndicator.tsx`)

Hiển thị status dot với styling giống Facebook.

```typescript
interface StatusIndicatorProps {
  userId: string;
  size?: 'small' | 'medium' | 'large'; // 8px | 10px | 12px
  showBorder?: boolean;                 // White border
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  className?: string;
}

export function StatusIndicator(props: StatusIndicatorProps): JSX.Element
```

**Styling:**
- Online: `#42b72a` (green)
- Away: `#ffa500` (amber/orange)  
- Offline: `#8a8d91` (gray)
- Border: 2px solid white
- Size: 10px diameter (default)
- Position: absolute, bottom-right of avatar
- Transition: all 0.2s ease

### 4. Status Text Component (`StatusText.tsx`)

Hiển thị "Active X minutes ago".

```typescript
interface StatusTextProps {
  userId: string;
  format?: 'short' | 'long';  // "2m" vs "2 minutes ago"
  showOnlineText?: boolean;    // Show "Active now" for online users
  className?: string;
}

export function StatusText(props: StatusTextProps): JSX.Element
```

**Time Formatting Logic:**
- < 1 min: "Active just now"
- < 60 min: "Active X minutes ago"
- < 24 hours: "Active X hours ago"
- >= 24 hours: "Active X days ago"
- Online: "Active now"

**Auto-update:**
- Sử dụng `setInterval` với interval 60 seconds
- Cleanup interval khi unmount

### 5. Status Hook (`useUserStatus.ts`)

React hook để lấy status của một user.

```typescript
interface UserStatusData {
  status: UserStatus;
  lastActive: number;
  isOnline: boolean;
  isAway: boolean;
  isOffline: boolean;
  timeAgo: string;        // Formatted time string
  loading: boolean;
  error: Error | null;
}

function useUserStatus(userId: string): UserStatusData
```

**Implementation:**
- Subscribe to Firebase path: `/presence/{userId}`
- Cache data để giảm re-renders
- Automatically unsubscribe khi unmount
- Handle privacy và blocked users

### 6. Online Users List Hook (`useOnlineUsers.ts`)

Lấy danh sách users đang online.

```typescript
interface OnlineUsersOptions {
  limit?: number;           // Max số users trả về
  includeAway?: boolean;    // Include "away" users
  sortBy?: 'lastActive' | 'name'; // Sort order
}

interface OnlineUserData {
  userId: string;
  status: UserStatus;
  lastActive: number;
}

function useOnlineUsers(options?: OnlineUsersOptions): {
  users: OnlineUserData[];
  count: number;
  loading: boolean;
}
```

**Optimization:**
- Sử dụng Firebase query: `orderByChild('status').equalTo('online')`
- Batch reads để giảm database operations
- Cache results với TTL 30 seconds

## Data Models

### Presence Data Model

```typescript
interface PresenceData {
  status: 'online' | 'away' | 'offline';
  lastActive: number;                    // Server timestamp
  connections: Record<string, ConnectionInfo>;
  settings: PresenceSettings;
}

interface ConnectionInfo {
  device: 'web' | 'mobile' | 'desktop';
  timestamp: number;
  userAgent?: string;
  location?: string;                     // Optional: City/Country
}

interface PresenceSettings {
  privacyMode: boolean;    // Only friends can see status
  invisibleMode: boolean;  // Appear offline to everyone
}
```

### Activity Event Model

```typescript
interface ActivityEvent {
  type: 'mousemove' | 'keydown' | 'click' | 'touchstart' | 'scroll';
  timestamp: number;
  throttled: boolean;
}
```

### Status Update Model

```typescript
interface StatusUpdate {
  userId: string;
  previousStatus: UserStatus;
  newStatus: UserStatus;
  timestamp: number;
  trigger: 'activity' | 'timeout' | 'manual' | 'disconnect';
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Activity Detection Across All Event Types

*For any* user interaction event (mouse, keyboard, touch, scroll), the Activity Detector should detect and record the activity with the correct timestamp.

**Validates: Requirements 1.1, 8.1**

### Property 2: Event Throttling Rate Limit

*For any* sequence of activity events occurring within a 30-second window, the Activity Detector and Update Debouncer should trigger at most 1 status update.

**Validates: Requirements 1.5, 4.1**

### Property 3: Idle Timeout Transitions

*For any* user with online status, when no activity is detected for 5 minutes, the Status Manager should transition status to "away", and after 15 minutes total inactivity, should transition to "offline".

**Validates: Requirements 1.2, 1.3**

### Property 4: Activity Recovery

*For any* user in "away" or "offline" status, when any activity is detected, the Status Manager should transition status back to "online" within 2 seconds.

**Validates: Requirements 1.4**

### Property 5: Real-time Status Propagation

*For any* user status change, all connected clients subscribed to that user's status should receive the update within 3 seconds.

**Validates: Requirements 2.1**

### Property 6: Status Indicator Color Mapping

*For any* user status value, the Status Indicator component should render the correct color: green (#42b72a) for "online", amber (#ffa500) for "away", and gray (#8a8d91) for "offline".

**Validates: Requirements 2.2, 2.3, 2.4**

### Property 7: Status Text Formatting

*For any* user with a lastActive timestamp, the Status Text component should display the correct format: "Active now" if online, "Active just now" if < 1 minute ago, "Active X minutes ago" if < 60 minutes, "Active X hours ago" if < 24 hours, and "Active X days ago" if >= 24 hours.

**Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6**

### Property 8: Auto-update Timestamp Display

*For any* rendered Status Text component showing a relative time, the displayed text should automatically update every 60 seconds to reflect the current time difference.

**Validates: Requirements 3.3**

### Property 9: Disconnect Auto-offline

*For any* user who closes their browser or loses connection, the Status Manager should automatically set their status to "offline" within 30 seconds using Firebase's onDisconnect() mechanism.

**Validates: Requirements 4.3**

### Property 10: Stale Data Cleanup

*For any* presence data with lastActive timestamp older than 7 days, the Presence Database cleanup process should automatically remove the stale data.

**Validates: Requirements 4.5**

### Property 11: Batch Query Optimization

*For any* request to load a list of user statuses, the Status System should batch multiple user queries into a single database read operation.

**Validates: Requirements 4.6**

### Property 12: Status Indicator Positioning

*For any* rendered Status Indicator with an avatar, the indicator should be positioned at the bottom-right corner (or specified position) of the avatar element.

**Validates: Requirements 5.1**

### Property 13: Hover Tooltip Display

*For any* Status Indicator that receives a hover event, the Status Text tooltip should appear within 300ms.

**Validates: Requirements 5.3**

### Property 14: User List Status Text Layout

*For any* user displayed in a user list, the Status Text should appear next to the username and be styled in light gray color.

**Validates: Requirements 5.5**

### Property 15: Privacy Mode Visibility

*For any* user with privacy mode enabled, their online status should be hidden from all users except those in their friends list.

**Validates: Requirements 6.1**

### Property 16: Blocked User Status Hiding

*For any* pair of users where user A has blocked user B, user A's status should not be visible to user B.

**Validates: Requirements 6.2**

### Property 17: Authentication Required for Writes

*For any* attempt to write presence data, the operation should only succeed if the request includes valid user authentication credentials.

**Validates: Requirements 6.3**

### Property 18: Unauthorized Read Denial

*For any* unauthorized attempt to read another user's protected status, the Presence Database should deny the request.

**Validates: Requirements 6.4**

### Property 19: Invisible Mode Status Override

*For any* user with invisible mode enabled, their displayed status should appear as "offline" to all other users regardless of their actual activity.

**Validates: Requirements 6.5**

### Property 20: Multi-tab Activity Sync

*For any* user with multiple browser tabs open, activity detected in any tab should update the user's global status.

**Validates: Requirements 7.1**

### Property 21: Multi-device Status Aggregation

*For any* user with connections from multiple devices, the Status Manager should display status as "online" if at least one device is online, and only display "offline" when all devices disconnect.

**Validates: Requirements 7.2, 7.3**

### Property 22: Network Loss Grace Period

*For any* temporary network connection loss, the Status System should maintain the last known status for up to 2 minutes before transitioning to "offline".

**Validates: Requirements 7.5**

### Property 23: Mobile Background Status Persistence

*For any* mobile app transitioning to background, the Status Manager should maintain "online" status for 5 minutes before switching to "away", and when returning to foreground, should update to "online" within 2 seconds.

**Validates: Requirements 8.2, 8.3**

### Property 24: Low Battery Update Reduction

*For any* mobile device reporting low battery status, the Status System should reduce the update frequency to conserve battery.

**Validates: Requirements 8.5**

### Property 25: Metrics Tracking

*For any* status update operation, the Status System should track and record metrics including total online users count, update latency, and failure count.

**Validates: Requirements 9.2**

### Property 26: Consecutive Failure Alert

*For any* user experiencing 3 consecutive status update failures, the Status System should log an error and trigger an alert to the monitoring system.

**Validates: Requirements 9.4**


## Error Handling

### 1. Network Errors

**Scenario:** Firebase connection lost or unstable

**Handling Strategy:**
- Implement exponential backoff retry mechanism (1s, 2s, 4s, 8s, max 30s)
- Display connection status indicator to user
- Queue status updates locally and flush when connection restored
- Use Firebase's built-in offline persistence
- Maintain last known status for up to 2 minutes before marking offline

**Error Messages:**
- User-facing: "Kết nối không ổn định. Đang thử kết nối lại..."
- Developer: `NetworkError: Failed to sync status. Attempt ${retryCount}/${maxRetries}`

### 2. Authentication Errors

**Scenario:** User not authenticated or token expired

**Handling Strategy:**
- Catch authentication errors from Firebase
- Trigger re-authentication flow
- Suspend presence tracking until authenticated
- Clear local presence data on auth failure
- Log security event for monitoring

**Error Messages:**
- User-facing: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
- Developer: `AuthError: User not authenticated. UserId: ${userId}`

### 3. Permission Denied Errors

**Scenario:** User attempts to access status they don't have permission to see

**Handling Strategy:**
- Gracefully return null or default "offline" status
- Don't expose the reason for permission denial (security)
- Log attempted unauthorized access
- Cache permission denials to avoid repeated checks

**Error Messages:**
- User-facing: (Silent - show default offline status)
- Developer: `PermissionError: Access denied to /presence/${userId}`

### 4. Rate Limit Errors

**Scenario:** Too many updates in short time period

**Handling Strategy:**
- Implement client-side throttling (30s minimum)
- Queue updates and batch them
- Show warning in debug mode only
- Automatically retry after cooldown period

**Error Messages:**
- Developer: `RateLimitError: Status updates throttled. Next update allowed in ${seconds}s`

### 5. Data Validation Errors

**Scenario:** Invalid status value or malformed data

**Handling Strategy:**
- Validate all data before writing to Firebase
- Use TypeScript types for compile-time validation
- Sanitize user inputs
- Fallback to safe default values
- Log validation failures for debugging

**Error Messages:**
- Developer: `ValidationError: Invalid status value "${value}". Expected: online|away|offline`

### 6. Database Write Errors

**Scenario:** Failed to update presence data in Firebase

**Handling Strategy:**
- Retry up to 3 times with exponential backoff
- If all retries fail, log error and alert monitoring
- Continue tracking activity locally
- Attempt to sync on next successful connection
- Track consecutive failure count

**Error Messages:**
- User-facing: "Không thể cập nhật trạng thái. Vui lòng kiểm tra kết nối."
- Developer: `DatabaseError: Failed to write presence data after ${attempts} attempts`

### 7. State Inconsistency Errors

**Scenario:** Client status out of sync with server

**Handling Strategy:**
- Periodically verify local status matches Firebase (every 5 minutes)
- If mismatch detected, trust server and update local state
- Log inconsistency for investigation
- Force refresh from server on next activity

**Error Messages:**
- Developer: `SyncError: State mismatch detected. Local: ${localStatus}, Server: ${serverStatus}`

### 8. Memory Leak Prevention

**Scenario:** Event listeners not cleaned up properly

**Handling Strategy:**
- Use React useEffect cleanup functions
- Track all active listeners in a registry
- Implement timeout for automatic cleanup
- Test with React DevTools Profiler
- Document all subscription lifecycles

**Error Messages:**
- Developer: `MemoryLeakWarning: ${count} active listeners detected for unmounted component`

## Testing Strategy

### Dual Testing Approach

Hệ thống sử dụng kết hợp **unit tests** và **property-based tests** để đảm bảo correctness toàn diện:

- **Unit tests**: Verify specific examples, edge cases, và error conditions
- **Property tests**: Verify universal properties across all inputs
- Together: Comprehensive coverage (unit tests catch concrete bugs, property tests verify general correctness)

### Unit Testing

**Test Framework:** Vitest + React Testing Library

**Coverage Areas:**

1. **Activity Detector Tests**
   - Specific event types trigger detection
   - Throttling works correctly for burst events
   - Multi-tab sync via localStorage
   - Cleanup on unmount

2. **Status Manager Tests**
   - State transitions: online → away → offline
   - Recovery from away/offline to online
   - Firebase connection/disconnect handling
   - Invisible mode behavior
   - Privacy mode filtering

3. **UI Component Tests**
   - StatusIndicator renders correct colors
   - StatusText formats time correctly for specific cases
   - Tooltip appears on hover
   - Position props work correctly

4. **Hook Tests**
   - useUserStatus returns correct data structure
   - useOnlineUsers filters and sorts correctly
   - Proper cleanup of subscriptions
   - Error handling

5. **Integration Tests**
   - End-to-end flow: activity → detection → update → UI
   - Multi-device scenarios
   - Privacy and blocking scenarios
   - Network interruption recovery

**Example Unit Tests:**

```typescript
describe('StatusIndicator', () => {
  it('displays green dot for online users', () => {
    const { container } = render(
      <StatusIndicator userId="user1" />
    );
    const dot = container.querySelector('.status-dot');
    expect(dot).toHaveStyle({ backgroundColor: '#42b72a' });
  });

  it('displays gray dot for offline users', () => {
    // Similar test for offline
  });
});

describe('Activity Detector', () => {
  it('detects mouse move event', () => {
    const { result } = renderHook(() => useActivityDetector());
    
    fireEvent.mouseMove(document);
    
    expect(result.current.isActive).toBe(true);
  });

  it('throttles rapid events', async () => {
    // Test throttling logic
  });
});
```

### Property-Based Testing

**Test Framework:** fast-check (JavaScript property-based testing library)

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with design property reference
- Tag format: `Feature: user-activity-status, Property {number}: {property_text}`

**Property Test Examples:**

```typescript
import fc from 'fast-check';

// Property 1: Activity Detection Across All Event Types
test('Feature: user-activity-status, Property 1: Activity detection', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('mousemove', 'keydown', 'click', 'touchstart', 'scroll'),
      fc.integer({ min: 0, max: 1000000 }),
      (eventType, timestamp) => {
        const detector = new ActivityDetector();
        const event = new Event(eventType);
        
        detector.handleEvent(event, timestamp);
        
        // Property: All event types should be detected
        expect(detector.lastActivity).toBeGreaterThan(0);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 2: Event Throttling Rate Limit
test('Feature: user-activity-status, Property 2: Throttling rate limit', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 29999 }), { minLength: 5, maxLength: 20 }),
      (eventTimestamps) => {
        const updateCalls: number[] = [];
        const detector = new ActivityDetector({
          throttleMs: 30000,
          onUpdate: (ts) => updateCalls.push(ts)
        });
        
        // Fire multiple events within 30s window
        eventTimestamps.forEach(ts => {
          detector.handleEvent(new Event('click'), ts);
        });
        
        // Property: Maximum 1 update per 30s window
        expect(updateCalls.length).toBeLessThanOrEqual(1);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 3: Idle Timeout Transitions
test('Feature: user-activity-status, Property 3: Idle timeouts', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 300000, max: 600000 }),  // 5-10 min
      fc.integer({ min: 900000, max: 1800000 }), // 15-30 min
      (awayTime, offlineTime) => {
        const manager = new StatusManager('user123');
        const now = Date.now();
        
        manager.setLastActivity(now);
        manager.setStatus('online');
        
        // Simulate time passing to away threshold
        manager.checkStatus(now + awayTime);
        expect(manager.getStatus()).toBe('away');
        
        // Simulate time passing to offline threshold
        manager.checkStatus(now + offlineTime);
        expect(manager.getStatus()).toBe('offline');
      }
    ),
    { numRuns: 100 }
  );
});

// Property 7: Status Text Formatting
test('Feature: user-activity-status, Property 7: Time formatting', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 7 * 24 * 60 * 60 * 1000 }), // 0-7 days
      (millisAgo) => {
        const lastActive = Date.now() - millisAgo;
        const text = formatStatusText(lastActive, 'offline');
        
        // Property: Correct format based on duration
        if (millisAgo < 60000) {
          expect(text).toMatch(/Active just now/);
        } else if (millisAgo < 3600000) {
          expect(text).toMatch(/Active \d+ minutes ago/);
        } else if (millisAgo < 86400000) {
          expect(text).toMatch(/Active \d+ hours ago/);
        } else {
          expect(text).toMatch(/Active \d+ days ago/);
        }
      }
    ),
    { numRuns: 100 }
  );
});

// Property 15: Privacy Mode Visibility
test('Feature: user-activity-status, Property 15: Privacy mode', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string(), { minLength: 0, maxLength: 10 }), // Friends list
      fc.string(), // Viewer user ID
      (friendIds, viewerId) => {
        const user = {
          id: 'user123',
          settings: { privacyMode: true },
          friends: friendIds
        };
        
        const canView = checkStatusVisibility(user, viewerId);
        
        // Property: Only friends can see status when privacy mode enabled
        expect(canView).toBe(friendIds.includes(viewerId));
      }
    ),
    { numRuns: 100 }
  );
});

// Property 21: Multi-device Status Aggregation
test('Feature: user-activity-status, Property 21: Multi-device aggregation', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          device: fc.constantFrom('web', 'mobile', 'desktop'),
          status: fc.constantFrom('online', 'away', 'offline')
        }),
        { minLength: 1, maxLength: 5 }
      ),
      (connections) => {
        const aggregatedStatus = aggregateDeviceStatuses(connections);
        
        // Property: Status is "online" if any device is online
        const hasOnline = connections.some(c => c.status === 'online');
        if (hasOnline) {
          expect(aggregatedStatus).toBe('online');
        }
        
        // Property: Status is "offline" only if all devices are offline
        const allOffline = connections.every(c => c.status === 'offline');
        if (allOffline) {
          expect(aggregatedStatus).toBe('offline');
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

### Test Coverage Goals

- **Line Coverage**: Minimum 80%
- **Branch Coverage**: Minimum 75%
- **Property Coverage**: 100% of identified properties (all 26 properties tested)
- **Critical Paths**: 100% coverage for authentication, privacy, and state transitions

### Performance Testing

**Metrics to Track:**
- Status update latency (target: < 1s p95)
- Real-time propagation delay (target: < 3s p95)
- Memory usage over 24 hours (target: stable, no leaks)
- Database read/write operations per hour
- Battery consumption on mobile (measure with Chrome DevTools)

**Load Testing:**
- Simulate 100+ concurrent users
- Test with high activity frequency
- Monitor Firebase quota usage
- Test multi-device scenarios

### Manual Testing Checklist

- [ ] Test on Chrome, Firefox, Safari, Edge
- [ ] Test on iOS Safari and Android Chrome
- [ ] Test with slow 3G network throttling
- [ ] Test with network interruptions (airplane mode on/off)
- [ ] Verify tooltips work on touch devices
- [ ] Check color contrast for accessibility
- [ ] Verify behavior with ad blockers enabled
- [ ] Test privacy mode with friend/non-friend users
- [ ] Test invisible mode completely hides status
- [ ] Verify multi-tab sync works correctly
- [ ] Check mobile background/foreground transitions
- [ ] Test with Firebase emulator for development

### Monitoring and Observability

**Production Metrics:**
- Total online users (real-time dashboard)
- Status update success rate (target: > 99%)
- Average update latency (target: < 1s)
- Failed authentication attempts
- Privacy permission denials
- Error rates by error type

**Alerts:**
- Status update failure rate > 5% for 5 minutes
- Average latency > 3s for 5 minutes
- Authentication error spike (> 100/min)
- Database quota approaching limit (> 80%)

**Logging:**
- Debug mode: Log all status transitions
- Production: Log only errors and warnings
- Include userId, timestamp, status, trigger in logs
- Use structured logging for easy querying

