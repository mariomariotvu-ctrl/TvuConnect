import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';
import type { StudentProfile } from '../types';
import { DatingDeck } from './DatingDeck';

vi.mock('../services/datingService', () => ({
  recordDatingDecision: vi.fn(async () => ({ matched: false })),
  updateDatingPreferences: vi.fn(async () => undefined),
}));

vi.mock('./ReportModal', () => ({
  ReportModal: () => null,
}));

const timestamp = { seconds: 0, nanoseconds: 0, toDate: () => new Date(0) } as Timestamp;
const user = { uid: 'current-user' } as User;

const profile = (overrides: Partial<StudentProfile> = {}): StudentProfile => ({
  uid: 'current-user',
  mssv: '110122001',
  fullName: 'Sinh viên hiện tại',
  email: 'student@tvu.edu.vn',
  age: 20,
  datingEnabled: true,
  hideFaceInDating: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const renderDeck = (currentProfile: StudentProfile, profiles: StudentProfile[]) => render(
  <DatingDeck
    currentUser={user}
    currentProfile={currentProfile}
    profiles={profiles}
    loading={false}
    onFindProfiles={vi.fn()}
    onLoadMore={vi.fn()}
    onStartChat={vi.fn()}
  />,
);

describe('DatingDeck privacy and age gates', () => {
  it('không tải ảnh của ứng viên khi họ bật ẩn mặt', () => {
    const hiddenCandidate = profile({
      uid: 'hidden-candidate',
      fullName: 'Bạn Ẩn Danh',
      photoURL: 'https://example.com/face.jpg',
      hideFaceInDating: true,
    });

    renderDeck(profile(), [hiddenCandidate]);

    expect(screen.getByText(/Người này chọn ẩn ảnh/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('hiển thị ảnh ứng viên khi họ cho phép', () => {
    const visibleCandidate = profile({
      uid: 'visible-candidate',
      fullName: 'Bạn Công Khai',
      photoURL: 'https://example.com/face.jpg',
      hideFaceInDating: false,
    });

    renderDeck(profile(), [visibleCandidate]);

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/face.jpg');
  });

  it('khóa chế độ hẹn hò với hồ sơ dưới 18 tuổi', () => {
    renderDeck(profile({ age: 17 }), []);

    expect(screen.getByText('Hẹn hò chỉ dành cho sinh viên từ 18 tuổi')).toBeInTheDocument();
    expect(screen.queryByText('Tìm hồ sơ phù hợp')).not.toBeInTheDocument();
  });
});
