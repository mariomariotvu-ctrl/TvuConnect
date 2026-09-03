/**
 * Location utilities for TVU Connect
 * Handles geolocation, distance calculation, and location-based filtering
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface LocationPreset {
  id: string;
  name: string;
  coords: Coordinates;
}

// Predefined locations around TVU
export const TVU_LOCATION_PRESETS: LocationPreset[] = [
  {
    id: 'tvu_campus',
    name: 'Trường ĐH Trà Vinh',
    coords: { lat: 9.9345, lng: 106.3461 }
  },
  {
    id: 'tvu_dorm',
    name: 'Ký túc xá TVU',
    coords: { lat: 9.9350, lng: 106.3465 }
  },
  {
    id: 'khu_1',
    name: 'Khu 1',
    coords: { lat: 9.9340, lng: 106.3455 }
  },
  {
    id: 'khu_4',
    name: 'Khu 4',
    coords: { lat: 9.9360, lng: 106.3470 }
  },
  {
    id: 'city_center',
    name: 'Trung tâm TP Trà Vinh',
    coords: { lat: 9.9355, lng: 106.3450 }
  }
];

/**
 * Calculate distance between two coordinates using improved Haversine formula
 * with WGS84 ellipsoid model and dynamic correction factor
 * @param coord1 First coordinate
 * @param coord2 Second coordinate
 * @returns Distance in kilometers
 */
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  // WGS84 ellipsoid parameters for better accuracy
  const a = 6378.137; // Equatorial radius in km
  const b = 6356.752; // Polar radius in km
  const f = (a - b) / a; // Flattening
  
  // Average radius at the latitude (more accurate than fixed 6371)
  const avgLat = toRad((coord1.lat + coord2.lat) / 2);
  const R = Math.sqrt(
    ((a * a * Math.cos(avgLat)) ** 2 + (b * b * Math.sin(avgLat)) ** 2) /
    ((a * Math.cos(avgLat)) ** 2 + (b * Math.sin(avgLat)) ** 2)
  );
  
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  
  const haversineA = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(haversineA), Math.sqrt(1 - haversineA));
  let distance = R * c;
  
  // IMPORTANT: Display "as-the-crow-flies" distance WITHOUT correction
  // This is the straight-line distance, not the actual walking/driving distance
  // Google Maps will show the actual route distance which is always longer
  // We keep it simple and accurate - no artificial inflation
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Convert degrees to radians
 */
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Format distance for display
 * Note: This shows straight-line distance (as-the-crow-flies)
 * Actual walking/driving distance will be longer
 * @param distance Distance in kilometers
 * @returns Formatted string
 */
export function formatDistance(distance: number): string {
  if (distance < 1) {
    return `${Math.round(distance * 1000)}m`;
  }
  return `${distance.toFixed(1)}km`;
}



/**
 * Filter places by radius
 * @param places Array of places with distance property
 * @param maxRadius Maximum radius in kilometers
 * @returns Filtered places
 */
export function filterByRadius<T extends { distance?: number }>(
  places: T[],
  maxRadius: number
): T[] {
  return places.filter(place => 
    place.distance !== undefined && place.distance <= maxRadius
  );
}

/**
 * Sort places by distance (nearest first)
 */
export function sortByDistance<T extends { distance?: number }>(places: T[]): T[] {
  return [...places].sort((a, b) => {
    if (a.distance === undefined) return 1;
    if (b.distance === undefined) return -1;
    return a.distance - b.distance;
  });
}

/**
 * Get category label in Vietnamese
 */
export function getCategoryLabel(category: string): string {
  const labels: { [key: string]: string } = {
    cafe: 'quán nước',
    restaurant: 'quán ăn',
    vegetarian: 'quán chay',
    pharmacy: 'nhà thuốc',
    flower: 'tiệm hoa',
    printing: 'tiệm in',
    clothing: 'tiệm quần áo',
    shop: 'cửa hàng',
    bookstore: 'nhà sách',
    study: 'chỗ học',
    sport: 'sân thể thao',
    entertainment: 'khu vui chơi',
    library: 'thư viện',
    park: 'công viên',
    other: 'địa điểm'
  };
  
  return labels[category] || 'địa điểm';
}


