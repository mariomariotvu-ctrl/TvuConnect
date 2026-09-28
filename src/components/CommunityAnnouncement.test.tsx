import React, { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: {
    communityAnnouncementEnabled: true,
    communityAnnouncementId: 'welcome-v1',
    communityAnnouncementTitle: 'Hé Lô ✌🏻 anh em!',
    communityAnnouncementBody: 'Cùng xây dựng cộng đồng TVU 💜',
  },
  claim: vi.fn(), custom: vi.fn(), dismiss: vi.fn(), listener: undefined as undefined | ((config: unknown) => void),
}));
vi.mock('../config/runtimeConfig', () => ({
  getRuntimeConfig: () => mocks.config,
  initializeRuntimeConfig: async () => mocks.config,
  subscribeRuntimeConfig: (listener: (config: unknown) => void) => {
    mocks.listener = listener; listener(mocks.config);
    return () => { mocks.listener = undefined; };
  },
}));
vi.mock('../services/communityAnnouncementService', () => ({
  claimCommunityAnnouncement: mocks.claim,
  isAnnouncementId: (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id),
}));
vi.mock('sonner', () => ({ toast: { custom: mocks.custom, dismiss: mocks.dismiss } }));
import { CommunityAnnouncement, CommunityAnnouncementCard } from './CommunityAnnouncement';

const tick = async (ms = 4_100) => {
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

describe('CommunityAnnouncement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.config.communityAnnouncementEnabled = true;
    mocks.claim.mockResolvedValue('claimed');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => vi.useRealTimers());

  it('shows one readable, dismissible toast even in StrictMode', async () => {
    const view = render(<StrictMode><CommunityAnnouncement uid="alice" paused={false} /></StrictMode>);
    await tick();
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.custom).toHaveBeenCalledTimes(1);
    expect(mocks.custom.mock.calls[0][1]).toMatchObject({ duration: 20_000, id: 'community:alice:welcome-v1' });
    view.rerender(<StrictMode><CommunityAnnouncement uid="alice" paused={false} /></StrictMode>);
    await tick(65_000);
    expect(mocks.custom).toHaveBeenCalledTimes(1);
  });

  it('waits for onboarding/calls to finish', async () => {
    const view = render(<CommunityAnnouncement uid="alice" paused />);
    await tick();
    expect(mocks.claim).not.toHaveBeenCalled();
    view.rerender(<CommunityAnnouncement uid="alice" paused={false} />);
    await tick();
    expect(mocks.custom).toHaveBeenCalledTimes(1);
  });

  it('retains a claim if a call starts during the request, then displays afterwards', async () => {
    let resolve: (value: string) => void;
    mocks.claim.mockReturnValue(new Promise(r => { resolve = r; }));
    const view = render(<CommunityAnnouncement uid="alice" paused={false} />);
    await tick();
    view.rerender(<CommunityAnnouncement uid="alice" paused />);
    await act(async () => { resolve!('claimed'); });
    expect(mocks.custom).not.toHaveBeenCalled();
    view.rerender(<CommunityAnnouncement uid="alice" paused={false} />);
    await tick(1);
    expect(mocks.custom).toHaveBeenCalledTimes(1);
  });

  it('does not show a previously received campaign', async () => {
    mocks.claim.mockResolvedValue('seen');
    render(<CommunityAnnouncement uid="alice" paused={false} />);
    await tick();
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.custom).not.toHaveBeenCalled();
  });

  it('does not consume a campaign in a hidden tab', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    render(<CommunityAnnouncement uid="alice" paused={false} />);
    await tick();
    expect(mocks.claim).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange'));
    await tick();
    expect(mocks.custom).toHaveBeenCalledTimes(1);
  });

  it('obeys the live campaign switch', async () => {
    mocks.config.communityAnnouncementEnabled = false;
    render(<CommunityAnnouncement uid="alice" paused={false} />);
    await tick();
    expect(mocks.claim).not.toHaveBeenCalled();
    act(() => mocks.listener?.({ ...mocks.config, communityAnnouncementEnabled: true }));
    await tick();
    expect(mocks.custom).toHaveBeenCalledTimes(1);
    act(() => mocks.listener?.({ ...mocks.config, communityAnnouncementEnabled: false }));
    expect(mocks.dismiss).toHaveBeenCalledWith('community:alice:welcome-v1');
  });

  it('renders plain text safely and provides an accessible close button', () => {
    const close = vi.fn();
    render(<CommunityAnnouncementCard title="Hé Lô ✌🏻 anh em!" body={'<script>alert(1)</script>'} onClose={close} />);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo cộng đồng' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
