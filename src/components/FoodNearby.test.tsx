import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodNearby } from './FoodNearby';

const discoverFoodPlaces = vi.fn();

vi.mock('../services/foodDiscoveryService', () => ({
  discoverFoodPlaces: (...args: unknown[]) => discoverFoodPlaces(...args),
}));

const providerPlaces = [
  {
    id: 'google:cafe-1',
    name: 'Cà phê Sinh Viên',
    category: 'cafe' as const,
    location: { lat: 9.935, lng: 106.346, address: 'Phường 5, Trà Vinh' },
    rating: 4.6,
    reviewCount: 120,
    checkInCount: 0,
    currentVisitors: 0,
    createdBy: 'google_places',
    dataSource: 'google_places' as const,
    foodTags: ['Cà phê & học bài'],
    popularityScore: 9.2,
  },
  {
    id: 'google:food-1',
    name: 'Cơm Nhà TVU',
    category: 'restaurant' as const,
    location: { lat: 9.936, lng: 106.347, address: 'Phường 5, Trà Vinh' },
    rating: 4.4,
    reviewCount: 80,
    checkInCount: 0,
    currentVisitors: 0,
    createdBy: 'google_places',
    dataSource: 'google_places' as const,
    foodTags: ['Món Việt'],
    popularityScore: 8.4,
  },
];

describe('FoodNearby', () => {
  beforeEach(() => {
    discoverFoodPlaces.mockReset();
    discoverFoodPlaces.mockResolvedValue({
      places: providerPlaces,
      source: 'google_places',
      fetchedAt: Date.now(),
      attribution: 'Google Maps',
    });
  });

  it('shows transient Google Places results with visible attribution inside the app', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <FoodNearby
        places={[]}
        userLocation={null}
        locating={false}
        onRequestLocation={vi.fn()}
        onSelect={onSelect}
      />,
    );

    expect(await screen.findByText('Cà phê Sinh Viên')).toBeInTheDocument();
    expect(screen.getAllByText('Google Maps')).toHaveLength(2);
    expect(container.querySelector('a[href*="google"]')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Xem chi tiết trong TVU Connect' })[0]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'google:cafe-1' }));
  });

  it('filters provider results into Gen Z-friendly food groups', async () => {
    render(
      <FoodNearby
        places={[]}
        userLocation={null}
        locating={false}
        onRequestLocation={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await screen.findByText('Cơm Nhà TVU');
    fireEvent.click(screen.getByRole('button', { name: 'Cà phê & trà' }));
    await waitFor(() => expect(screen.queryByText('Cơm Nhà TVU')).not.toBeInTheDocument());
    expect(screen.getByText('Cà phê Sinh Viên')).toBeInTheDocument();
  });
});
