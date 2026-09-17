import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppNavigation } from './AppNavigation';

describe('AppNavigation', () => {
  it('renders one clear desktop entry for each primary destination', () => {
    render(<AppNavigation view="home" onNavigate={vi.fn()} />);

    const labels = ['Trang chủ', 'Tìm bạn', 'Tin nhắn', 'Cộng đồng', 'Tài liệu', 'Khám phá'];
    labels.forEach((label) => expect(screen.getAllByRole('button', { name: label })).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Tiện ích' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang chủ' })).toHaveAttribute('aria-current', 'page');
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

    expect(screen.getByRole('button', { name: 'Tìm bạn' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Cộng đồng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tài liệu' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(onMore).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Khám phá' }));
    expect(onNavigate).toHaveBeenCalledWith('explore');
  });
});
