import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../contexts/ThemeContext';
import { MobileMoreMenu } from './MobileMoreMenu';

const renderMenu = (overrides: Partial<React.ComponentProps<typeof MobileMoreMenu>> = {}) => {
  const props: React.ComponentProps<typeof MobileMoreMenu> = {
    open: true,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onOpenExplore: vi.fn(),
    onOpenMatching: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };

  render(
    <ThemeProvider>
      <MobileMoreMenu {...props} />
    </ThemeProvider>,
  );

  return props;
};

describe('MobileMoreMenu', () => {
  it('shows the secondary destinations in a visible dialog', () => {
    renderMenu();

    expect(screen.getByRole('dialog', { name: 'Tất cả tiện ích' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tìm trọ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ăn gì quanh đây/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thông báo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cài đặt/ })).toBeInTheDocument();
  });

  it('closes and opens the requested destination', () => {
    const props = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: /Thư viện học liệu/ }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onNavigate).toHaveBeenCalledWith('documents');
  });

  it('opens explore tools without leaving an invisible overlay behind', () => {
    const props = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: /Ăn gì quanh đây/ }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onOpenExplore).toHaveBeenCalledWith('food');
  });

  it('groups matching modes under one clear connection section', () => {
    const props = renderMenu();

    fireEvent.click(screen.getByRole('button', { name: /Gọi nhanh 1–1/ }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onOpenMatching).toHaveBeenCalledWith('quick');
  });
});
