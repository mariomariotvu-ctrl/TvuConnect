import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppNavigation } from './AppNavigation';

describe('AppNavigation', () => {
  it('keeps only the four daily destinations at the primary level', () => {
    render(<AppNavigation view="home" onNavigate={vi.fn()} />);

    const labels = ['Trang chủ', 'Kết nối', 'Tin nhắn', 'Quanh bạn'];
    labels.forEach((label) => expect(screen.getAllByRole('button', { name: label })).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Mở tất cả tiện ích' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cộng đồng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tài liệu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang chủ' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Trang chủ' })).toHaveAttribute('data-tour', 'desktop-home');
  });

  it('keeps the compact navigation focused and opens secondary destinations through More', () => {
    const onNavigate = vi.fn();
    const onMore = vi.fn();
    render(
      <AppNavigation
        view="students"
        mobile
        moreOpen={false}
        onNavigate={onNavigate}
        onMore={onMore}
      />,
    );

    expect(screen.getByRole('button', { name: 'Kết nối' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Kết nối' })).toHaveAttribute('data-tour', 'mobile-students');
    expect(screen.getByRole('button', { name: 'Mở tất cả tiện ích' })).toHaveAttribute('data-tour', 'mobile-more');
    expect(screen.queryByRole('button', { name: 'Cộng đồng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tài liệu' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mở tất cả tiện ích' }));
    expect(onMore).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Quanh bạn' }));
    expect(onNavigate).toHaveBeenCalledWith('explore');
  });

  it('shows unread messages on the inbox destination instead of the notification bell', () => {
    render(<AppNavigation view="home" messageUnreadCount={7} onNavigate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Tin nhắn, 7 chưa đọc' })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
