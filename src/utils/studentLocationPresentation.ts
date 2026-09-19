import { formatDistance } from './locationUtils';

export type StudentLocationPrecision = 'friend' | 'major' | 'tvu';

export interface StudentDistancePresentation {
  label: string;
  displayMeters: number;
  privacyRadiusMeters: number;
}

export function presentStudentDistance(
  distanceMeters: number,
  precision: StudentLocationPrecision,
): StudentDistancePresentation {
  const safeDistance = Math.max(0, Number(distanceMeters) || 0);

  if (precision === 'friend') {
    const displayMeters = Math.max(10, Math.round(safeDistance / 10) * 10);
    return {
      label: safeDistance < 10 ? 'Cách bạn dưới 10 m' : `Cách bạn ${formatDistance(displayMeters / 1_000)}`,
      displayMeters,
      privacyRadiusMeters: 10,
    };
  }

  if (precision === 'major') {
    const displayMeters = Math.max(100, Math.round(safeDistance / 100) * 100);
    return {
      label: safeDistance < 100
        ? 'Trong cùng khu vực khoảng 100 m'
        : `Cách bạn khoảng ${formatDistance(displayMeters / 1_000)}`,
      displayMeters,
      privacyRadiusMeters: 100,
    };
  }

  const displayMeters = Math.max(1_000, Math.round(safeDistance / 1_000) * 1_000);
  return {
    label: safeDistance < 1_000
      ? 'Trong cùng khu vực khoảng 1 km'
      : `Cách bạn khoảng ${Math.round(displayMeters / 1_000)} km`,
    displayMeters,
    privacyRadiusMeters: 1_000,
  };
}

export function formatRouteDuration(durationSeconds: number): string {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
}

export function routeInstruction(type: string, modifier: string, roadName: string): string {
  const road = roadName ? ` vào ${roadName}` : '';
  if (type === 'depart') return roadName ? `Bắt đầu trên ${roadName}` : 'Bắt đầu di chuyển';
  if (type === 'arrive') return 'Đến vị trí bạn bè đang chia sẻ';
  if (type === 'roundabout' || type === 'rotary') return `Đi qua vòng xoay${road}`;
  if (modifier.includes('left')) return `Rẽ trái${road}`;
  if (modifier.includes('right')) return `Rẽ phải${road}`;
  if (modifier === 'uturn') return `Quay đầu${road}`;
  return roadName ? `Tiếp tục trên ${roadName}` : 'Tiếp tục đi thẳng';
}
