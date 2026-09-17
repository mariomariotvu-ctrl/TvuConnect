import { Coordinates } from './locationUtils';

/**
 * A 0.02 degree grid is roughly 1.5–2.2km wide around Trà Vinh. It is a
 * useful discovery radius while avoiding storage of a student's exact point.
 */
const CELL_SIZE = 0.02;

export interface ApproximateLocation {
  latitude: number;
  longitude: number;
  cell: string;
}

const cellIndexes = ({ lat, lng }: Coordinates) => ({
  latitudeIndex: Math.floor(lat / CELL_SIZE),
  longitudeIndex: Math.floor(lng / CELL_SIZE),
});

const cellId = (latitudeIndex: number, longitudeIndex: number) =>
  `${latitudeIndex}:${longitudeIndex}`;

export function approximateLocation(coordinates: Coordinates): ApproximateLocation {
  const { latitudeIndex, longitudeIndex } = cellIndexes(coordinates);

  return {
    cell: cellId(latitudeIndex, longitudeIndex),
    // The centre of the grid, not the actual browser location.
    latitude: Number(((latitudeIndex + 0.5) * CELL_SIZE).toFixed(4)),
    longitude: Number(((longitudeIndex + 0.5) * CELL_SIZE).toFixed(4)),
  };
}

/** Firestore's `in` operator accepts up to 10 values; this returns 9 cells. */
export function nearbyCells(coordinates: Coordinates): string[] {
  const { latitudeIndex, longitudeIndex } = cellIndexes(coordinates);
  const cells: string[] = [];

  for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
    for (let longitudeOffset = -1; longitudeOffset <= 1; longitudeOffset += 1) {
      cells.push(cellId(latitudeIndex + latitudeOffset, longitudeIndex + longitudeOffset));
    }
  }

  return cells;
}

export function requestBrowserLocation(): Promise<Coordinates> {
  if (!('geolocation' in navigator)) {
    return Promise.reject(new Error('Thiết bị của bạn không hỗ trợ định vị.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'Bạn chưa cho phép vị trí. Hãy bật quyền vị trí rồi thử lại.'
          : 'Không thể lấy vị trí hiện tại. Vui lòng thử lại ở nơi có kết nối tốt.';
        reject(new Error(message));
      },
      {
        enableHighAccuracy: false,
        timeout: 12_000,
        maximumAge: 5 * 60_000,
      },
    );
  });
}
