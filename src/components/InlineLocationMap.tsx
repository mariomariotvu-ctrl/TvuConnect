import React, { useEffect, useMemo } from 'react';
import { Icon } from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { useTheme } from '../contexts/ThemeContext';

interface InlineLocationMapProps {
  latitude: number;
  longitude: number;
  title: string;
  address?: string;
  zoom?: number;
}

const locationIcon = new Icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const CenterAndResize: React.FC<{ position: [number, number]; zoom: number }> = ({ position, zoom }) => {
  const map = useMap();

  useEffect(() => {
    map.setView(position, zoom, { animate: false });
    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    const timeout = window.setTimeout(() => map.invalidateSize(), 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [map, position, zoom]);

  return null;
};

export const InlineLocationMap: React.FC<InlineLocationMapProps> = ({
  latitude,
  longitude,
  title,
  address,
  zoom = 16,
}) => {
  const { theme } = useTheme();
  const position = useMemo<[number, number]>(() => [latitude, longitude], [latitude, longitude]);
  const validCoordinates = Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;

  if (!validCoordinates) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        Chưa có tọa độ hợp lệ để hiển thị bản đồ.
      </div>
    );
  }

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-label={`Bản đồ vị trí ${title}`}>
      <div className="flex items-start gap-2 px-4 py-3">
        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Vị trí trên bản đồ TVU Connect</h4>
          {address && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{address}</p>}
          <p className="mt-1 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </p>
        </div>
      </div>
      <div className="h-56 w-full border-t border-slate-200 dark:border-slate-700">
        <MapContainer
          center={position}
          zoom={zoom}
          className="h-full w-full"
          scrollWheelZoom={false}
          attributionControl
        >
          <CenterAndResize position={position} zoom={zoom} />
          <TileLayer
            attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
            url={theme === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
              : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
            maxZoom={19}
          />
          <Marker position={position} icon={locationIcon} />
        </MapContainer>
      </div>
      <p className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        Kéo hoặc phóng to bản đồ ngay tại đây; ứng dụng không chuyển sang trang khác.
      </p>
    </section>
  );
};
