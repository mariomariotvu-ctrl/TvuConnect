import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '../types';

const mocks = vi.hoisted(() => ({
  listeners: [] as Array<{ next: Function; error: Function; stop: ReturnType<typeof vi.fn> }>,
  set: vi.fn(), update: vi.fn(), commit: vi.fn(),
}));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  query: (ref: unknown) => ref,
  serverTimestamp: () => 'SERVER_TIME',
  onSnapshot: (_query: unknown, next: Function, error: Function) => {
    const stop = vi.fn();
    mocks.listeners.push({ next, error, stop });
    return stop;
  },
  writeBatch: () => ({ set: mocks.set, update: mocks.update, commit: mocks.commit }),
}));
import { Timestamp } from 'firebase/firestore';
import { markNotificationRead, markNotificationsRead, subscribeToNotifications } from './notificationCenterService';

const snapshot = (data: Record<string, Record<string, unknown>> = {}) => ({
  docs: Object.entries(data).map(([id, value]) => ({ id, data: () => value })),
});
const event = {
  type: 'new_profile', actorUid: 'new-student', title: 'Bạn mới',
  createdAt: Timestamp.fromMillis(2000),
};

describe('community notification subscriptions', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.listeners = []; mocks.commit.mockResolvedValue(undefined); });

  it('waits for both block lists, merges realtime updates and uses private read receipts', () => {
    const changed = vi.fn();
    const stop = subscribeToNotifications('me', changed);
    mocks.listeners[0].next(snapshot());
    mocks.listeners[1].next(snapshot({ new_profile_student: event }));
    mocks.listeners[2].next(snapshot());
    mocks.listeners[3].next(snapshot());
    expect(changed).not.toHaveBeenCalled();
    mocks.listeners[4].next(snapshot());
    expect(changed.mock.lastCall?.[0]).toEqual([expect.objectContaining({
      id: 'new_profile_student', recipientUid: 'me', source: 'community', readAt: null,
    })]);
    const readAt = Timestamp.fromMillis(3000);
    mocks.listeners[2].next(snapshot({ new_profile_student: { readAt } }));
    expect(changed.mock.lastCall?.[0][0].readAt).toBe(readAt);
    mocks.listeners[4].next(snapshot({ block: { blockerUid: 'new-student' } }));
    expect(changed.mock.lastCall?.[0]).toEqual([]);
    stop();
    expect(mocks.listeners.every(listener => listener.stop.mock.calls.length === 1)).toBe(true);
  });

  it('hides the feed if a privacy listener fails, including on later feed updates', () => {
    const changed = vi.fn(); const failed = vi.fn();
    subscribeToNotifications('me', changed, failed);
    mocks.listeners.forEach(listener => listener.next(snapshot()));
    mocks.listeners[3].error(new Error('permission denied'));
    expect(changed.mock.lastCall?.[0]).toEqual([]);
    changed.mockClear();
    mocks.listeners[1].next(snapshot({ new_profile_student: event }));
    expect(changed).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledOnce();
  });

  it('marks a shared event read privately without modifying the global event', async () => {
    await markNotificationRead('me', 'new_profile_student', 'new_profile', 'community');
    expect(mocks.set).toHaveBeenCalledWith('users/me/communityNotificationReads/new_profile_student', { readAt: 'SERVER_TIME' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it('marks matching private and shared events consistently when reading all', async () => {
    await markNotificationsRead('me', [
      { ...event, id: 'shared', source: 'community' },
      { ...event, id: 'targeted', source: 'personal' },
      { type: 'friend_request', id: 'request', source: 'personal' },
    ] as AppNotification[]);
    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledWith('users/me/notifications/targeted', { readAt: 'SERVER_TIME' });
    expect(mocks.update).toHaveBeenCalledWith('users/me/notifications/request', { readAt: 'SERVER_TIME' });
    expect(mocks.commit).toHaveBeenCalledOnce();
  });
});
