/**
 * Preservation Property-Based Tests
 * 
 * File: message-send-preservation.pbt.test.tsx
 * Mục tiêu: Verify các hành vi KHÔNG liên quan đến bug vẫn hoạt động đúng sau fix
 * 
 * **Validates: Requirements 2.5, 2.6, 3.1-3.12**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { Chat } from '../../../src/components/Chat';
import * as firebase from '../../../src/firebase';
import { toast } from 'sonner';
import fc from 'fast-check';
import * as useCachedMessagesModule from '../../../src/hooks/useCachedMessages';
import * as securityModule from '../../../src/utils/security';

// ── Rate limiter control ──────────────────────────────────────────────────────
let rateLimiterAllowed = true;

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../src/utils/security', () => {
  // RateLimiter phải là constructor function thực sự (không phải arrow function)
  function RateLimiterMock(this: any) {
    this.canProceed = function() {
      return rateLimiterAllowed ? { allowed: true } : { allowed: false, retryAfter: 30 };
    };
  }
  return {
    RateLimiter: RateLimiterMock,
    validateMessage: vi.fn(() => ({ valid: true })),
    validateAudioSize: vi.fn(() => ({ valid: true })),
    sanitizeInput: vi.fn((text: string) => text.trim()),
    shouldBlockMessage: vi.fn(() => ({ blocked: false })),
    moderateContent: vi.fn(() => ({ safe: true })),
    logViolation: vi.fn()
  };
});

vi.mock('../../../src/firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      uid: 'test-user-uid',
      email: 'test@example.com'
    }
  },
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ seconds: Date.now() / 1000 })),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  handleFirestoreError: vi.fn(),
  OperationType: { GET: 'GET', ADD: 'ADD', UPDATE: 'UPDATE' },
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  uploadBytesResumable: vi.fn(),
  storage: {}
}));

vi.mock('../../../src/hooks/useCachedMessages', () => ({
  useCachedMessages: vi.fn(() => ({
    messages: [],
    loading: false,
    error: null,
    fromCache: false,
    hasMore: false,
    loadMore: vi.fn(),
    refresh: vi.fn()
  }))
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../../src/utils/listenerRegistry', () => ({
  listenerRegistry: {
    register: vi.fn(() => 'listener-id'),
    unregister: vi.fn()
  }
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('lucide-react', () => ({
  Send: () => <div data-testid="send-icon">Send</div>,
  Loader2: () => <div data-testid="loader-icon">Loading</div>,
  User: () => <div>User</div>,
  ArrowLeft: () => <div>Back</div>,
  Phone: () => <div>Phone</div>,
  Mail: () => <div>Mail</div>,
  GraduationCap: () => <div>GraduationCap</div>,
  Info: () => <div>Info</div>,
  X: () => <div>X</div>,
  Mic: () => <div>Mic</div>,
  Square: () => <div>Square</div>,
  Play: () => <div>Play</div>,
  Pause: () => <div>Pause</div>,
  Trash2: () => <div>Trash2</div>,
  ShieldOff: () => <div>ShieldOff</div>,
  Smile: () => <div>Smile</div>,
  Check: () => <div>Check</div>,
  CheckCheck: () => <div>CheckCheck</div>,
  Clock: () => <div>Clock</div>
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>
  },
  AnimatePresence: ({ children }: any) => <>{children}</>
}));

vi.mock('../../../src/contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => ({ theme: 'light', toggleTheme: vi.fn(), isAutoMode: false })),
  ThemeProvider: ({ children }: any) => <>{children}</>
}));

vi.mock('../../../src/components/ProfileCard', () => ({
  ProfileCard: () => <div>ProfileCard</div>
}));

vi.mock('../../../src/components/ConfirmModal', () => ({
  ConfirmModal: () => <div>ConfirmModal</div>
}));

vi.mock('../../../src/components/SkeletonLoader', () => ({
  MessageSkeleton: () => <div>MessageSkeleton</div>
}));

vi.mock('../../../src/components/OnlineStatus', () => ({
  OnlineStatus: () => <div>OnlineStatus</div>
}));

vi.mock('../../../src/utils/accessibility', () => ({
  a11yProps: vi.fn(),
  handleKeyboardClick: vi.fn()
}));

vi.mock('../../../src/utils/network', () => ({
  retryOperation: vi.fn(),
  isOnline: vi.fn(() => true)
}));

vi.mock('../../../src/utils/constants', () => ({
  FIRESTORE_LIMITS: {
    MAX_MESSAGES_PER_CHAT: 100
  },
  TIMING: {},
  VALIDATION: {}
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const renderChat = () => render(<Chat receiverUid="receiver-uid" onBack={vi.fn()} />);

const waitForInput = () => waitFor(() => screen.getByPlaceholderText(/nhập tin nhắn/i));

const submitMessage = (text: string) => {
  const input = screen.getByPlaceholderText(/nhập tin nhắn/i);
  const form = input.closest('form')!;
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(form);
};

const setupDefaultMocks = () => {
  rateLimiterAllowed = true;
  vi.mocked(firebase.addDoc).mockResolvedValue({ id: 'msg-123' } as any);
  vi.mocked(firebase.setDoc).mockResolvedValue(undefined as any);
  vi.mocked(firebase.updateDoc).mockResolvedValue(undefined as any);
  vi.mocked(firebase.getDoc).mockResolvedValue({
    exists: () => true,
    data: () => ({ fullName: 'Test User' })
  } as any);
  vi.mocked(firebase.getDocs).mockResolvedValue({ size: 50 } as any);
  vi.mocked(useCachedMessagesModule.useCachedMessages).mockReturnValue({
    messages: [],
    loading: false,
    error: null,
    fromCache: false,
    hasMore: false,
    loadMore: vi.fn(),
    refresh: vi.fn()
  });
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Property 2: Preservation - Validation và Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ── 3.1: Empty/whitespace message returns early ────────────────────────────
  it('3.1: Empty message returns early BEFORE setSending(true)', async () => {
    renderChat();
    await waitForInput();

    submitMessage('   ');

    await new Promise(r => setTimeout(r, 150));

    expect(firebase.addDoc).not.toHaveBeenCalled();
    expect(screen.queryByTestId('loader-icon')).toBeNull();
  });

  // ── 3.2: validateMessage - nội dung vi phạm ───────────────────────────────
  it('3.2: Invalid message shows toast error and skips send', async () => {
    vi.mocked(securityModule.validateMessage).mockReturnValueOnce({ valid: false, error: 'Tin nhắn không hợp lệ' });

    renderChat();
    await waitForInput();

    submitMessage('bad message');

    await new Promise(r => setTimeout(r, 150));

    expect(firebase.addDoc).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Tin nhắn không hợp lệ');
  });

  // ── 3.3: Content moderation blocks inappropriate content ───────────────────
  it('3.3: Content moderation blocks inappropriate content', async () => {
    vi.mocked(securityModule.shouldBlockMessage).mockReturnValueOnce({ blocked: true, reason: 'Nội dung vi phạm' });

    renderChat();
    await waitForInput();

    submitMessage('inappropriate content');

    await new Promise(r => setTimeout(r, 150));

    expect(firebase.addDoc).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Nội dung vi phạm');
  });

  // ── 3.4: Rate limiting ─────────────────────────────────────────────────────
  it('3.4: Rate limiting returns early with toast error', async () => {
    rateLimiterAllowed = false;

    renderChat();
    await waitForInput();

    submitMessage('test message');

    await new Promise(r => setTimeout(r, 150));

    expect(firebase.addDoc).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('giây'));
  });

  // ── 3.5: Message count limit ───────────────────────────────────────────────
  it('3.5: Message count limit (100 msgs) shows toast and prevents send', async () => {
    const mockMessages = Array.from({ length: 100 }, (_, i) => ({
      id: `msg-${i}`,
      senderUid: 'test-user-uid',
      receiverUid: 'receiver-uid',
      text: `Message ${i}`,
      createdAt: { toMillis: () => Date.now(), toDate: () => new Date() },
      read: true,
      participants: ['test-user-uid', 'receiver-uid'],
      conversationId: 'test-user-uid_receiver-uid',
      type: 'text' as const
    }));
    vi.mocked(useCachedMessagesModule.useCachedMessages).mockReturnValue({
      messages: mockMessages,
      loading: false,
      error: null,
      fromCache: false,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn()
    });

    renderChat();
    await waitForInput();

    submitMessage('one more message');

    await new Promise(r => setTimeout(r, 150));

    expect(firebase.addDoc).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('100'));
  });

  // ── 3.6: Firestore permission-denied error ────────────────────────────────
  it('3.6: permission-denied error shows toast and resets sending', async () => {
    vi.mocked(firebase.addDoc).mockRejectedValueOnce({
      code: 'permission-denied',
      message: 'Permission denied'
    });

    renderChat();
    await waitForInput();

    submitMessage('test message');

    await waitFor(() => {
      expect(firebase.addDoc).toHaveBeenCalled();
    }, { timeout: 3000 });

    await new Promise(r => setTimeout(r, 300));

    expect(screen.queryByTestId('loader-icon')).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  // ── 3.7: Firestore unavailable error ─────────────────────────────────────
  it('3.7: unavailable error shows toast and resets sending', async () => {
    vi.mocked(firebase.addDoc).mockRejectedValueOnce({
      code: 'unavailable',
      message: 'Service unavailable'
    });

    renderChat();
    await waitForInput();

    submitMessage('test message');

    await waitFor(() => {
      expect(firebase.addDoc).toHaveBeenCalled();
    }, { timeout: 3000 });

    await new Promise(r => setTimeout(r, 300));

    expect(screen.queryByTestId('loader-icon')).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('server'));
  });

  // ── 3.8: UI - nút disabled khi input rỗng ────────────────────────────────
  it('3.8: Send button is disabled when message is empty', async () => {
    renderChat();
    await waitForInput();

    const button = screen.getByTitle(/gửi tin nhắn/i);
    expect(button).toBeDisabled();
  });

  // ── 3.9: UI - nút enabled khi có tin nhắn ────────────────────────────────
  it('3.9: Send button is enabled when message is non-empty', async () => {
    renderChat();
    await waitForInput();

    const input = screen.getByPlaceholderText(/nhập tin nhắn/i);
    fireEvent.change(input, { target: { value: 'hello' } });

    const button = screen.getByTitle(/gửi tin nhắn/i);
    expect(button).not.toBeDisabled();
  });

  // ── 3.10: Property-based - validation giữ nguyên cho tin nhắn rỗng ────────
  it('3.10: PBT - empty/whitespace messages always rejected without calling addDoc', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 20 })
          .map(s => s.replace(/\S/g, ' ')), // chỉ giữ whitespace
        async (whitespace) => {
          vi.clearAllMocks();
          setupDefaultMocks();

          const { unmount } = renderChat();
          await waitFor(() => screen.getByPlaceholderText(/nhập tin nhắn/i));

          submitMessage(whitespace);
          await new Promise(r => setTimeout(r, 100));

          const addDocCalled = vi.mocked(firebase.addDoc).mock.calls.length > 0;
          unmount();
          return !addDocCalled;
        }
      ),
      { numRuns: 5 }
    );
  });

  // ── 3.11: Input cleared after successful send ─────────────────────────────
  it('3.11: Input is cleared after successful text message send', async () => {
    renderChat();
    await waitForInput();

    const input = screen.getByPlaceholderText(/nhập tin nhắn/i);
    fireEvent.change(input, { target: { value: 'Hello world' } });

    expect(input).toHaveValue('Hello world');

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(firebase.addDoc).toHaveBeenCalled();
    }, { timeout: 3000 });

    await new Promise(r => setTimeout(r, 300));

    // Input phải được xóa (optimistic UI clear ngay khi submit)
    expect(input).toHaveValue('');
  });

  // ── 3.12: General error shows toast ───────────────────────────────────────
  it('3.12: Unknown Firestore error shows generic toast and resets sending', async () => {
    vi.mocked(firebase.addDoc).mockRejectedValueOnce(new Error('Unknown error'));

    renderChat();
    await waitForInput();

    submitMessage('test message');

    await waitFor(() => {
      expect(firebase.addDoc).toHaveBeenCalled();
    }, { timeout: 3000 });

    await new Promise(r => setTimeout(r, 300));

    expect(screen.queryByTestId('loader-icon')).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('thất bại'));
  });
});
