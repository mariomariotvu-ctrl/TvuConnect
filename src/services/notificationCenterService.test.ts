import { describe, expect, it } from 'vitest';
import { safeNotificationRoute } from './notificationCenterService';

describe('safeNotificationRoute', () => {
  it('keeps supported internal notification routes', () => {
    expect(safeNotificationRoute('/friends')).toBe('/friends');
    expect(safeNotificationRoute('/messages/student%2F01')).toBe('/messages/student%2F01');
    expect(safeNotificationRoute('/connect/lover')).toBe('/connect/lover');
  });

  it('rejects external or unsupported routes', () => {
    expect(safeNotificationRoute('https://example.com')).toBe('/notifications');
    expect(safeNotificationRoute('//example.com')).toBe('/notifications');
    expect(safeNotificationRoute('/admin')).toBe('/notifications');
  });
});
