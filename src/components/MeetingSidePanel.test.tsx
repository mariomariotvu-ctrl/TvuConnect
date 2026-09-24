import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StudyRoom, StudyRoomParticipant } from '../types/socialAudio';
import { MeetingSidePanel } from './MeetingSidePanel';

const room: StudyRoom = {
  id: 'room-1',
  ownerUid: 'owner-1',
  title: 'Ôn thi cùng nhau',
  subject: 'Cấu trúc dữ liệu',
  status: 'open',
  maxParticipants: 8,
  participantCount: 2,
  roomLocked: false,
  audioLocked: false,
  videoLocked: false,
  screenShareLocked: false,
};

const participants: StudyRoomParticipant[] = [
  { uid: 'owner-1', displayName: 'Chủ phòng', muted: false },
  { uid: 'student-2', displayName: 'Bạn học', muted: false, handRaised: true },
];

const renderPanel = (overrides: Partial<ComponentProps<typeof MeetingSidePanel>> = {}) => {
  const props: ComponentProps<typeof MeetingSidePanel> = {
    panel: 'people',
    room,
    participants,
    currentUserUid: 'owner-1',
    busyParticipantUid: null,
    onClose: vi.fn(),
    onMuteParticipant: vi.fn(),
    onRemoveParticipant: vi.fn(),
    onToggleControl: vi.fn(),
    ...overrides,
  };
  render(<MeetingSidePanel {...props} />);
  return props;
};

describe('MeetingSidePanel', () => {
  it('cho chủ phòng tắt mic và mời thành viên rời phòng', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Tắt micro Bạn học' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mời Bạn học rời phòng' }));

    expect(props.onMuteParticipant).toHaveBeenCalledWith(participants[1]);
    expect(props.onRemoveParticipant).toHaveBeenCalledWith(participants[1]);
    expect(screen.getByTitle('Đang giơ tay')).toBeInTheDocument();
  });

  it('cho chủ phòng khóa phòng và thiết bị thành viên', () => {
    const props = renderPanel({ panel: 'controls' });

    fireEvent.click(screen.getByRole('button', { name: /Khóa phòng/ }));
    fireEvent.click(screen.getByRole('button', { name: /Khóa micro thành viên/ }));

    expect(props.onToggleControl).toHaveBeenNthCalledWith(1, 'roomLocked', true);
    expect(props.onToggleControl).toHaveBeenNthCalledWith(2, 'audioLocked', true);
  });

  it('không hiện điều khiển chủ phòng cho thành viên thường', () => {
    renderPanel({ panel: 'controls', currentUserUid: 'student-2' });

    expect(screen.getByText('Chỉ chủ phòng mới xem và thay đổi các quyền này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Khóa phòng/ })).not.toBeInTheDocument();
  });
});
