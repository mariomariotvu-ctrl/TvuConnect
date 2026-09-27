import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string } },
  popup: vi.fn().mockResolvedValue({}), redirect: vi.fn().mockResolvedValue(undefined),
  getRedirectResult: vi.fn().mockResolvedValue(null), event: vi.fn(), error: vi.fn(),
}));
vi.mock('../firebase', () => ({
  auth: mocks.auth, googleProvider: { setCustomParameters: vi.fn() },
  signInWithPopup: mocks.popup, signInWithRedirect: mocks.redirect, signOut: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ getRedirectResult: mocks.getRedirectResult }));
vi.mock('../utils/errorTracking', () => ({
  trackClientEvent: mocks.event, logError: mocks.error, getDiagnosticSupportCode: () => 'TEST123456',
}));
import { Auth } from './Auth';

const facebook = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1) Mobile/20G81 [FBAN/FBIOS;FBAV/577.0]';
const safari = 'Mozilla/5.0 iPhone Version/16.6 Mobile Safari/604.1';
const setUA = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.currentUser = null;
  window.history.replaceState({}, '', '/');
});
afterEach(() => vi.restoreAllMocks());

describe('in-app Google login recovery', () => {
  it('shows an actionable fallback in Facebook even while auth is still loading', async () => {
    setUA(facebook);
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
    render(<Auth user={null} loading={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép liên kết đăng nhập' }));
    await screen.findByRole('button', { name: 'Đã sao chép liên kết' });
    expect(copy).toHaveBeenCalledWith(expect.stringContaining('externalAuth=google'));
    expect(mocks.popup).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.getRedirectResult).not.toHaveBeenCalled();
    expect(screen.queryByText('Mở TVU Connect để đăng nhập')).not.toBeInTheDocument();
  });

  it('does not loop another browser launch when a handoff remains inside Facebook', () => {
    setUA(facebook);
    window.history.replaceState({}, '', '/?externalAuth=google&handoffId=test-handoff');
    const open = vi.spyOn(window, 'open');
    render(<Auth user={null} loading={false} />);
    expect(screen.getByText(/Không cần bấm mở lại/)).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(mocks.event).toHaveBeenCalledWith('auth.handoff_stayed_in_webview', { handoffId: 'test-handoff' });
  });

  it('keeps a selectable link when the clipboard is blocked', async () => {
    setUA(facebook);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });
    render(<Auth user={null} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép liên kết đăng nhập' }));
    expect(await screen.findByText(/Không thể tự sao chép/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Liên kết đăng nhập/ })).toHaveAttribute('readonly');
    expect(screen.queryByText('Đã sao chép liên kết')).not.toBeInTheDocument();
  });

  it('does not auto-login on arrival in Safari; login starts only on a user tap', async () => {
    setUA(safari);
    window.history.replaceState({}, '', '/?externalAuth=google&handoffId=test-handoff');
    render(<React.StrictMode><Auth user={null} loading={false} /></React.StrictMode>);
    await act(async () => {});
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.popup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập bằng Google' }));
    await waitFor(() => expect(mocks.popup).toHaveBeenCalledTimes(1));
    expect(mocks.event).toHaveBeenCalledWith('auth.popup_started', { provider: 'google', handoffId: 'test-handoff' });
  });

  it('does not open Google again for an already restored Safari user', async () => {
    setUA(safari);
    mocks.auth.currentUser = { uid: 'restored-user' };
    window.history.replaceState({}, '', '/?externalAuth=google&handoffId=test-handoff');
    render(<Auth user={null} loading={false} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập bằng Google' }));
    expect(mocks.popup).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.event).toHaveBeenCalledWith('auth.handoff_reused_session', { handoffId: 'test-handoff' });
  });

  it('does not turn a competing popup cancellation into another redirect', async () => {
    setUA(safari);
    mocks.popup.mockRejectedValueOnce({ code: 'auth/cancelled-popup-request' });
    render(<Auth user={null} loading={false} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập bằng Google' }));
    await screen.findByText(/Không thể đăng nhập lúc này/);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('ignores repeated taps while the first popup is pending', async () => {
    setUA(safari);
    let finish!: (value: unknown) => void;
    mocks.popup.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<Auth user={null} loading={false} />);
    await act(async () => {});
    const login = screen.getByRole('button', { name: 'Đăng nhập bằng Google' });
    fireEvent.click(login);
    fireEvent.click(login);
    expect(mocks.popup).toHaveBeenCalledTimes(1);
    await act(async () => finish({}));
  });

  it('offers Android intent once and then stops retrying on return', () => {
    setUA('Mozilla/5.0 Android FBAN/FB4A FBAV/577');
    render(<Auth user={null} loading={false} />);
    const link = screen.getByRole('link', { name: /Mở Chrome/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('intent://'));
    link.addEventListener('click', e => e.preventDefault());
    fireEvent.click(link);
    expect(screen.queryByRole('link', { name: /Mở Chrome/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sao chép/ })).toBeInTheDocument();
  });
});
