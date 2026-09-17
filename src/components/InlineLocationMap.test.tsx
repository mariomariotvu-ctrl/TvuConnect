import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../contexts/ThemeContext';
import { InlineLocationMap } from './InlineLocationMap';

const setView = vi.fn();
const invalidateSize = vi.fn();

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="embedded-map">{children}</div>,
  Marker: () => <div data-testid="location-marker" />,
  TileLayer: () => <div data-testid="map-tiles" />,
  useMap: () => ({ setView, invalidateSize }),
}));

describe('InlineLocationMap', () => {
  beforeEach(() => {
    setView.mockClear();
    invalidateSize.mockClear();
  });

  it('shows an embedded map and never creates an external navigation link', () => {
    const { container } = render(
      <ThemeProvider>
        <InlineLocationMap
          latitude={9.9419}
          longitude={106.33859}
          title="Nhà trọ sinh viên"
          address="Trà Vinh"
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole('region', { name: 'Bản đồ vị trí Nhà trọ sinh viên' })).toBeInTheDocument();
    expect(screen.getByTestId('embedded-map')).toBeInTheDocument();
    expect(screen.getByTestId('location-marker')).toBeInTheDocument();
    expect(screen.getByText('9.94190, 106.33859')).toBeInTheDocument();
    expect(screen.getByText('Trà Vinh')).toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();
  });

  it('does not initialize a map for invalid coordinates', () => {
    render(
      <ThemeProvider>
        <InlineLocationMap latitude={Number.NaN} longitude={106.33859} title="Vị trí lỗi" />
      </ThemeProvider>,
    );

    expect(screen.getByText('Chưa có tọa độ hợp lệ để hiển thị bản đồ.')).toBeInTheDocument();
    expect(screen.queryByTestId('embedded-map')).not.toBeInTheDocument();
  });
});
