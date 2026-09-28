import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), doc: vi.fn((...parts: unknown[]) => parts.slice(1).join('/')),
  runTransaction: vi.fn(),
}));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: firestore.doc,
  serverTimestamp: () => 'server-time',
  runTransaction: firestore.runTransaction,
}));
import { claimCommunityAnnouncement, isAnnouncementId } from './communityAnnouncementService';

describe('community announcement receipts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    firestore.get.mockResolvedValue({ exists: () => false });
    firestore.runTransaction.mockImplementation((_db, callback) => callback(firestore));
  });

  it('claims once per account and campaign, caching the committed receipt', async () => {
    expect(await claimCommunityAnnouncement('alice', 'welcome-v1', () => true)).toBe('claimed');
    expect(firestore.set).toHaveBeenCalledWith('users/alice/announcementReceipts/welcome-v1', { receivedAt: 'server-time' });
    expect(await claimCommunityAnnouncement('alice', 'welcome-v1', () => true)).toBe('seen');
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);
    expect(await claimCommunityAnnouncement('bob', 'welcome-v1', () => true)).toBe('claimed');
    expect(await claimCommunityAnnouncement('alice', 'welcome-v2', () => true)).toBe('claimed');
  });

  it('does not show again on another device with an existing server receipt', async () => {
    firestore.get.mockResolvedValue({ exists: () => true });
    expect(await claimCommunityAnnouncement('alice', 'welcome-v1', () => true)).toBe('seen');
    expect(firestore.set).not.toHaveBeenCalled();
  });

  it('does not consume the announcement if a call/tour starts while reading', async () => {
    expect(await claimCommunityAnnouncement('alice', 'welcome-v1', () => false)).toBe('deferred');
    expect(firestore.set).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('does not cache a failed transaction, permitting a later retry', async () => {
    firestore.runTransaction.mockRejectedValueOnce(new Error('offline'));
    await expect(claimCommunityAnnouncement('alice', 'welcome-v1', () => true)).rejects.toThrow('offline');
    expect(localStorage.length).toBe(0);
    expect(await claimCommunityAnnouncement('alice', 'welcome-v1', () => true)).toBe('claimed');
  });

  it('rejects invalid campaign paths and missing accounts', async () => {
    expect(isAnnouncementId('welcome/../../other')).toBe(false);
    expect(isAnnouncementId('a'.repeat(101))).toBe(false);
    expect(await claimCommunityAnnouncement('', 'welcome', () => true)).toBe('deferred');
    expect(await claimCommunityAnnouncement('alice', '', () => true)).toBe('deferred');
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });
});
