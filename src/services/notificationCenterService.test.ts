import { describe, expect, it } from 'vitest';
import { isGeneralNotification, safeNotificationRoute } from './notificationCenterService';

describe('isGeneralNotification', () => {
  it('keeps messages and calls in the inbox channel', () => {
    expect(isGeneralNotification({ type: 'message' })).toBe(false);
    expect(isGeneralNotification({ type: 'call' })).toBe(false);
  });

  it('keeps social, discovery and community activity in notifications', () => {
    expect(isGeneralNotification({ type: 'friend_request' })).toBe(true);
    expect(isGeneralNotification({ type: 'encounter' })).toBe(true);
    expect(isGeneralNotification({ type: 'comment' })).toBe(true);
    expect(isGeneralNotification({ type: 'system' })).toBe(true);
  });
});

describe('safeNotificationRoute', () => {
  it('keeps supported internal notification routes', () => {
    expect(safeNotificationRoute('/friends')).toBe('/friends');
    expect(safeNotificationRoute('/messages/student%2F01')).toBe('/messages/student%2F01');
    expect(safeNotificationRoute('/connect/lover')).toBe('/connect/lover');
    expect(safeNotificationRoute('/community')).toBe('/community');
  });

  it('rejects external or unsupported routes', () => {
    expect(safeNotificationRoute('https://example.com')).toBe('/notifications');
    expect(safeNotificationRoute('//example.com')).toBe('/notifications');
    expect(safeNotificationRoute('/admin')).toBe('/notifications');
  });
});
