import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { StudentProfile } from '../types';
import type { CallSession } from '../types/call';
import { CallDialog } from './CallDialog';

vi.mock('../services/callService', () => ({
  addCallCandidate: vi.fn(),
  answerCall: vi.fn(),
  createCall: vi.fn(),
  getCallIceServers: vi.fn(() => []),
  getCallIceServersForSession: vi.fn(() => Promise.resolve([])),
  getIceCandidateType: vi.fn(() => null),
  hasTurnRelayServer: vi.fn(() => false),
  subscribeToCall: vi.fn(() => () => undefined),
  subscribeToCallCandidates: vi.fn(() => () => undefined),
  updateCallStatus: vi.fn(),
}));

const currentUser = { uid: 'callee' } as User;
const peer = {
  uid: 'caller',
  fullName: 'Bạn học TVU',
} as StudentProfile;

const incomingCall: CallSession = {
  id: 'call-1',
  callerUid: 'caller',
  calleeUid: 'callee',
  participantUids: ['caller', 'callee'],
  kind: 'audio',
  status: 'ringing',
  offer: { type: 'offer', sdp: 'v=0' },
};

afterEach(cleanup);

describe('CallDialog media playback', () => {
  it('luôn gắn phần tử phát âm thanh cho cuộc gọi thoại', () => {
    render(
      <CallDialog
        currentUser={currentUser}
        peer={peer}
        direction="incoming"
        kind="audio"
        incomingCall={incomingCall}
        onClose={vi.fn()}
      />,
    );

    const audio = screen.getByLabelText('Âm thanh từ Bạn học TVU');
    expect(audio.tagName).toBe('AUDIO');
    expect(audio).toHaveAttribute('autoplay');
  });

  it('không tạo phần tử audio riêng khi video đã phát cả hình lẫn tiếng', () => {
    render(
      <CallDialog
        currentUser={currentUser}
        peer={peer}
        direction="incoming"
        kind="video"
        incomingCall={{ ...incomingCall, kind: 'video' }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Âm thanh từ Bạn học TVU')).not.toBeInTheDocument();
  });

  it('ẩn tên thật trong cuộc gọi ghép nhanh ẩn danh', () => {
    render(
      <CallDialog
        currentUser={currentUser}
        peer={{ ...peer, photoURL: 'https://example.com/private-face.jpg' }}
        direction="incoming"
        kind="audio"
        incomingCall={{ ...incomingCall, privacyMode: 'anonymous', source: 'quick_voice' }}
        context={{ privacyMode: 'anonymous', source: 'quick_voice', sourceSessionId: 'session-1' }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Bạn trò chuyện ẩn danh')).toHaveLength(2);
    expect(screen.getByLabelText('Âm thanh từ Bạn trò chuyện ẩn danh')).toBeInTheDocument();
    expect(screen.queryByText('Bạn học TVU')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
