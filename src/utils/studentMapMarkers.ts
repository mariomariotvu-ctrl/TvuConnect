export interface StudentMapPointSource {
  uid: string;
  latitude: number;
  longitude: number;
  isOwn: boolean;
}

export function studentMarkerInitials(fullName?: string | null): string {
  const words = (fullName || '')
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  if (words.length === 0) return 'SV';
  const selected = words.length === 1 ? [words[0]] : [words[0], words.at(-1)!];
  return selected.map((word) => Array.from(word)[0]).join('').toLocaleUpperCase('vi');
}

export function safeStudentMarkerPhotoURL(photoURL?: string | null): string | null {
  if (!photoURL) return null;
  const value = photoURL.trim();
  if (/^data:image\/(?:avif|gif|jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function escapeMarkerAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildVisibleStudentMapPoints(
  center: [number, number],
  locations: StudentMapPointSource[],
  localPosition?: { lat: number; lng: number } | null,
): Array<[number, number]> {
  const points: Array<[number, number]> = [center];

  for (const location of locations) {
    const point: [number, number] = location.isOwn && localPosition
      ? [localPosition.lat, localPosition.lng]
      : [location.latitude, location.longitude];
    if (Number.isFinite(point[0]) && Number.isFinite(point[1])) points.push(point);
  }

  const unique = new Map<string, [number, number]>();
  for (const point of points) {
    unique.set(`${point[0].toFixed(6)}:${point[1].toFixed(6)}`, point);
  }
  return [...unique.values()];
}
