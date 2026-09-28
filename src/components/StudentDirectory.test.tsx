import React from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';

const mocks = vi.hoisted(() => ({
  page: vi.fn(), profiles: vi.fn(), manage: vi.fn(), friendships: [] as unknown[],
  incoming: [] as unknown[], outgoing: [] as unknown[], blocked: new Set<string>(),
}));
vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('../hooks/useBlockedUsers', () => ({ useBlockedUsers: () => ({ blockedSet: mocks.blocked, isLoading: false, error: null }) }));
vi.mock('../utils/appSounds', () => ({ playAppSound: vi.fn() }));
vi.mock('../firebase', () => ({ db: {}, functions: {} }));
vi.mock('../services/studentDirectoryService', async importOriginal => ({
  ...await importOriginal<typeof import('../services/studentDirectoryService')>(),
  searchStudentPage: mocks.page, getStudentProfilesByIds: mocks.profiles,
}));
vi.mock('../services/friendConnectionService', async importOriginal => ({
  ...await importOriginal<typeof import('../services/friendConnectionService')>(),
  manageFriendConnection: mocks.manage,
  subscribeFriendConnections: (_uid: string, listener: Function) => { listener(mocks.friendships); return () => {}; },
  subscribeIncomingFriendRequests: (_uid: string, listener: Function) => { listener(mocks.incoming); return () => {}; },
  subscribeOutgoingFriendRequests: (_uid: string, listener: Function) => { listener(mocks.outgoing); return () => {}; },
}));
import { StudentDirectory } from './StudentDirectory';
const profile = (uid: string) => ({ uid, fullName: uid, createdAt: { toMillis: () => Date.now() - 1000 }, major: 'CNTT' });
const request = (fromUid: string, toUid: string) => ({ id: `${fromUid}_${toUid}`, fromUid, toUid, participantUids: [fromUid, toUid], status: 'pending' });
const renderDirectory = (path = '/friends') => render(<MemoryRouter initialEntries={[path]}>
  <StudentDirectory currentUser={{ uid: 'me' } as User} currentProfile={null} onStartChat={vi.fn()} />
</MemoryRouter>);

describe('StudentDirectory tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.friendships = [{ id: 'friendship', participantUids: ['me', 'Old Friend'], status: 'accepted' }];
    mocks.incoming = [request('Incoming Student', 'me')];
    mocks.outgoing = [request('me', 'Outgoing Student')];
    mocks.blocked.clear();
    mocks.page.mockResolvedValue({ students: [{ profile: profile('New Student') }] });
    mocks.profiles.mockImplementation(async (ids: string[]) => ids.map(profile));
    mocks.manage.mockResolvedValue({ status: 'accepted' });
  });

  it('defaults to new students and loads the actual friend ids in the friends tab', async () => {
    renderDirectory();
    expect(await screen.findByRole('heading', { name: 'New Student' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bạn bè 1' }));
    expect(await screen.findByRole('heading', { name: 'Old Friend' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New Student' })).not.toBeInTheDocument();
    expect(mocks.profiles).toHaveBeenCalledWith(['Old Friend']);
    expect(screen.getByRole('button', { name: 'Đã là bạn bè' })).toBeDisabled();
  });

  it('opens requests from notifications and supports decline and outgoing cancellation', async () => {
    renderDirectory('/friends?tab=requests');
    await screen.findByRole('heading', { name: 'Incoming Student' });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối lời mời' }));
    await waitFor(() => expect(mocks.manage).toHaveBeenCalledWith('Incoming Student', 'decline'));
    fireEvent.click(screen.getByRole('button', { name: 'Đã gửi (1)' }));
    await screen.findByRole('heading', { name: 'Outgoing Student' });
    fireEvent.click(screen.getByRole('button', { name: 'Đã gửi · Thu hồi' }));
    await waitFor(() => expect(mocks.manage).toHaveBeenCalledWith('Outgoing Student', 'cancel'));
  });

  it('does not count or render blocked friends', async () => {
    mocks.blocked.add('Old Friend');
    renderDirectory('/friends?tab=friends');
    expect(await screen.findByText('Bạn chưa kết nối với ai')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Old Friend' })).not.toBeInTheDocument();
    expect(mocks.profiles).not.toHaveBeenCalled();
  });

  it('shows retry on a failed friend load instead of claiming the list is empty', async () => {
    mocks.profiles.mockRejectedValueOnce(new Error('network'));
    renderDirectory('/friends?tab=friends');
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được danh sách');
    expect(screen.queryByText('Bạn chưa kết nối với ai')).not.toBeInTheDocument();
  });

  it('ignores stale discovery requests after changing filters', async () => {
    let finishOld: (value: unknown) => void;
    mocks.page.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    renderDirectory();
    await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText('Tìm tên, lớp, ngành học…'), { target: { value: 'New' } });
    expect(await screen.findByRole('heading', { name: 'New Student' })).toBeInTheDocument();
    await act(async () => finishOld!({ students: [{ profile: profile('Stale Student') }] }));
    expect(screen.queryByRole('heading', { name: 'Stale Student' })).not.toBeInTheDocument();
  });
});
