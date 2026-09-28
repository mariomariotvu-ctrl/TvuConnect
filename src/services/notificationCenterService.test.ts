import { describe, expect, it } from 'vitest';
import { isGeneralNotification, safeNotificationRoute, mergeNotificationFeed } from './notificationCenterService';
import { Timestamp } from 'firebase/firestore';
import type { AppNotification } from '../types';

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
    expect(safeNotificationRoute('/friends?tab=new')).toBe('/friends?tab=new');
    expect(safeNotificationRoute('/friends?tab=friends')).toBe('/friends?tab=friends');
    expect(safeNotificationRoute('/friends?tab=requests')).toBe('/friends?tab=requests');
    expect(safeNotificationRoute('/messages/student%2F01')).toBe('/messages/student%2F01');
    expect(safeNotificationRoute('/connect/lover')).toBe('/connect/lover');
    expect(safeNotificationRoute('/community')).toBe('/community');
  });

  it('rejects external or unsupported routes', () => {
    expect(safeNotificationRoute('https://example.com')).toBe('/notifications');
    expect(safeNotificationRoute('//example.com')).toBe('/notifications');
    expect(safeNotificationRoute('/admin')).toBe('/notifications');
    expect(safeNotificationRoute('/friends?tab=new&redirect=https://evil.test')).toBe('/notifications');
  });
});

describe('community notification merge', () => {
  const notice = (id: string, overrides: Partial<AppNotification> = {}): AppNotification => ({
    id, recipientUid: 'me', type: 'new_profile', title: 'Bạn mới', body: 'Vừa tham gia',
    actorUid: id, source: 'community', createdAt: Timestamp.fromMillis(2000), ...overrides,
  });
  it('deduplicates matching personal and community events and carries private read state', () => {
    const readAt = Timestamp.fromMillis(3000);
    const feed = mergeNotificationFeed([notice('a', { source: 'personal', body: 'Cùng sở thích' })],
      [notice('a')], new Map([['a', readAt]]), new Set(), 'me');
    expect(feed).toHaveLength(1);
    expect(feed[0].body).toBe('Cùng sở thích');
    expect(feed[0].readAt).toBe(readAt);
  });
  it('hides self, blocks, expired notices and messages, sorting newest first', () => {
    const feed = mergeNotificationFeed([notice('message', { type: 'message' })], [
      notice('me'), notice('blocked'), notice('expired', { expiresAt: Timestamp.fromMillis(1) }),
      notice('old', { createdAt: Timestamp.fromMillis(1000) }), notice('new'),
    ], new Map(), new Set(['blocked']), 'me');
    expect(feed.map(item => item.id)).toEqual(['new', 'old']);
  });
});
