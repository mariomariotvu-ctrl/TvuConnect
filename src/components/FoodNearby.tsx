import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarClock,
  Clock3,
  Flame,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  Star,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import { Place } from '../types';
import { calculateDistance, Coordinates, formatDistance } from '../utils/locationUtils';
import { discoverFoodPlaces } from '../services/foodDiscoveryService';

interface FoodNearbyProps {
  places: Place[];
  userLocation: Coordinates | null;
  locating: boolean;
  onRequestLocation: () => Promise<Coordinates | null>;
  onSelect: (place: Place & { distance?: number }) => void;
}

type FoodCategory = 'all' | 'meals' | 'coffee' | 'snacks' | 'dessert' | 'vegetarian';
type FoodSort = 'nearby' | 'hot' | 'rating' | 'new';

const TVU_CENTER: Coordinates = { lat: 9.9345, lng: 106.3461 };
const FOOD_CATEGORIES = new Set(['restaurant', 'cafe', 'vegetarian']);
const CATEGORY_OPTIONS: Array<{ value: FoodCategory; label: string; keywords: string[] }> = [
  { value: 'all', label: 'Tất cả', keywords: [] },
  { value: 'meals', label: 'Cơm & món Việt', keywords: ['món việt', 'quán ăn', 'bún', 'phở', 'mì', 'lẩu', 'nướng', 'hải sản'] },
  { value: 'coffee', label: 'Cà phê & trà', keywords: ['cà phê', 'trà', 'nước ép'] },
  { value: 'snacks', label: 'Ăn vặt', keywords: ['ăn vặt', 'bánh', 'đồ ăn nhanh', 'pizza', 'burger'] },
  { value: 'dessert', label: 'Tráng miệng', keywords: ['tráng miệng', 'kem', 'bánh'] },
  { value: 'vegetarian', label: 'Món chay', keywords: ['món chay'] },
];

const SORT_OPTIONS: Array<{ value: FoodSort; label: string }> = [
  { value: 'nearby', label: 'Gần nhất' },
  { value: 'hot', label: 'Đang được quan tâm' },
  { value: 'rating', label: 'Điểm cao' },
  { value: 'new', label: 'Mới & sắp mở' },
];

const normalizeText = (value = '') => value
  .toLocaleLowerCase('vi')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const openingBadge = (openingDate?: string | null) => {
  if (!openingDate) return null;
  const date = new Date(`${openingDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days >= 0 && days <= 180) {
    return { label: `Sắp mở ${date.toLocaleDateString('vi-VN')}`, rank: 2 };
  }
  if (days < 0 && days >= -120) return { label: 'Mới mở theo dữ liệu nguồn', rank: 1 };
  return null;
};

const scoreFor = (place: Place) => place.popularityScore
  ?? Number(place.rating || 0) * Math.log10(Number(place.reviewCount || 0) + 10);

const categoryMatches = (place: Place, category: FoodCategory) => {
  if (category === 'all') return true;
  if (category === 'vegetarian' && place.category === 'vegetarian') return true;
  if (category === 'coffee' && place.category === 'cafe') return true;
  const option = CATEGORY_OPTIONS.find((item) => item.value === category);
  const haystack = normalizeText(`${place.name} ${place.description || ''} ${(place.foodTags || []).join(' ')}`);
  return Boolean(option?.keywords.some((keyword) => haystack.includes(normalizeText(keyword))));
};

const mergePlaces = (communityPlaces: Place[], providerPlaces: Place[]) => {
  const external = providerPlaces.filter((place) => place.dataSource === 'google_places');
  const community = communityPlaces
    .filter((place) => FOOD_CATEGORIES.has(place.category) && place.location)
    .map((place) => ({ ...place, dataSource: place.dataSource || 'community' as const }));

  const dedupedCommunity = community.filter((candidate) => !external.some((remote) => (
    normalizeText(remote.name) === normalizeText(candidate.name)
    && calculateDistance(remote.location, candidate.location) <= 0.12
  )));
  return [...external, ...dedupedCommunity];
};

const providerErrorMessage = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('failed-precondition')) return 'Chưa cấu hình Google Places. Danh sách cộng đồng vẫn hoạt động bình thường.';
  if (code.includes('resource-exhausted')) return 'Đã đạt giới hạn làm mới tạm thời. Hãy dùng kết quả hiện tại.';
  return 'Nguồn địa điểm trực tiếp đang tạm bận. Đang hiển thị dữ liệu cộng đồng.';
};

export const FoodNearby: React.FC<FoodNearbyProps> = ({
  places,
  userLocation,
  locating,
  onRequestLocation,
  onSelect,
}) => {
  const [radius, setRadius] = useState<1 | 3 | 5 | 10>(5);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FoodCategory>('all');
  const [sort, setSort] = useState<FoodSort>('nearby');
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [providerPlaces, setProviderPlaces] = useState<Place[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const origin = userLocation || TVU_CENTER;

  const loadProviderPlaces = useCallback(async () => {
    setSourceLoading(true);
    try {
      const response = await discoverFoodPlaces(origin.lat, origin.lng);
      setProviderPlaces(response.places);
      setFetchedAt(response.fetchedAt);
      setSourceError(null);
    } catch (error) {
      console.warn('Could not load Google Places food discovery:', error);
      setSourceError(providerErrorMessage(error));
    } finally {
      setSourceLoading(false);
    }
  }, [origin.lat, origin.lng]);

  useEffect(() => {
    void loadProviderPlaces();
  }, [loadProviderPlaces]);

  const results = useMemo(() => {
    const keyword = normalizeText(search);
    const next = mergePlaces(places, providerPlaces)
      .map((place) => ({ ...place, distance: calculateDistance(origin, place.location) }))
      .filter((place) => place.distance <= radius)
      .filter((place) => categoryMatches(place, category))
      .filter((place) => !openNowOnly || place.isOpenNow === true || place.openHours === 'Đang mở cửa')
      .filter((place) => !keyword || normalizeText([
        place.name,
        place.location.address,
        place.description || '',
        ...(place.foodTags || []),
      ].join(' ')).includes(keyword));

    next.sort((left, right) => {
      if (sort === 'hot') return scoreFor(right) - scoreFor(left) || left.distance - right.distance;
      if (sort === 'rating') return Number(right.rating || 0) - Number(left.rating || 0)
        || Number(right.reviewCount || 0) - Number(left.reviewCount || 0);
      if (sort === 'new') {
        const leftRank = openingBadge(left.openingDate)?.rank || 0;
        const rightRank = openingBadge(right.openingDate)?.rank || 0;
        return rightRank - leftRank
          || String(right.openingDate || '').localeCompare(String(left.openingDate || ''))
          || left.distance - right.distance;
      }
      return left.distance - right.distance;
    });
    return next;
  }, [category, openNowOnly, origin, places, providerPlaces, radius, search, sort]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-3 pb-24 dark:bg-slate-950 sm:p-5">
      <section className="mx-auto max-w-5xl">
        <div className="rounded-[2rem] bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-orange-100">Ăn gì quanh đây?</p>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">Khám phá quán thật quanh bạn</h1>
              <p className="mt-2 max-w-2xl text-sm text-orange-50">Danh sách đi theo vị trí hiện tại của bạn, được cập nhật từ nguồn trực tiếp và đánh giá cộng đồng TVU.</p>
            </div>
            <button type="button" disabled={locating} onClick={() => void onRequestLocation()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-4 font-black text-rose-600 disabled:opacity-60">
              <LocateFixed className={`h-5 w-5 ${locating ? 'animate-pulse' : ''}`} />
              {userLocation ? 'Cập nhật vị trí' : 'Dùng vị trí của tôi'}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <div className="flex min-w-0 items-center gap-2">
            {sourceLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <BadgeCheck className="h-4 w-4 shrink-0" />}
            <span>{sourceLoading ? 'Đang cập nhật quán quanh bạn…' : sourceError || `${providerPlaces.length} địa điểm trực tiếp${fetchedAt ? ` · cập nhật ${new Date(fetchedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}`}</span>
          </div>
          <button type="button" disabled={sourceLoading} onClick={() => void loadProviderPlaces()} className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-2 font-black text-blue-700 disabled:opacity-60 dark:bg-slate-900 dark:text-blue-200"><RefreshCw className="h-3.5 w-3.5" /> Làm mới</button>
        </div>

        <div className="sticky top-0 z-20 mt-4 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm cà phê, trà, món Việt, ăn vặt…" className="min-h-11 w-full rounded-xl bg-slate-100 pl-9 pr-3 text-slate-900 dark:bg-slate-800 dark:text-white" />
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {CATEGORY_OPTIONS.map((option) => (
              <button key={option.value} type="button" onClick={() => setCategory(option.value)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${category === option.value ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'}`}>{option.label}</button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
            {SORT_OPTIONS.map((option) => (
              <button key={option.value} type="button" onClick={() => setSort(option.value)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${sort === option.value ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{option.label}</button>
            ))}
            <button type="button" onClick={() => setOpenNowOnly((value) => !value)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${openNowOnly ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>Đang mở cửa</button>
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto">
            {[1, 3, 5, 10].map((value) => (
              <button key={value} onClick={() => setRadius(value as 1 | 3 | 5 | 10)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${radius === value ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>Trong {value} km</button>
            ))}
            <span className="ml-auto shrink-0 text-xs font-bold text-slate-500">{results.length} quán</span>
          </div>
        </div>

        {sort === 'hot' && <p className="mt-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0" /> “Đang được quan tâm” được tính từ điểm và lượng đánh giá của nguồn, không có nghĩa là một món cụ thể đang bán chạy.</p>}

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700 md:col-span-2">
              <Utensils className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 font-bold text-slate-600 dark:text-slate-300">Chưa có quán phù hợp. Hãy đổi nhóm món hoặc mở rộng bán kính.</p>
            </div>
          ) : results.map((place) => {
            const newBadge = openingBadge(place.openingDate);
            const popular = Number(place.rating || 0) >= 4.2 && Number(place.reviewCount || 0) >= 50;
            const isProviderPlace = place.dataSource === 'google_places';
            return (
              <article key={place.id || `${place.name}-${place.location.lat}`} className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-slate-900 ${isProviderPlace ? 'border-blue-200 dark:border-blue-900' : 'border-slate-200 dark:border-slate-700'}`}>
                {place.images?.[0] && !isProviderPlace ? <img src={place.images[0]} alt={`Ảnh ${place.name}`} className="h-40 w-full object-cover" /> : (
                  <div className="flex h-28 items-center justify-center bg-gradient-to-br from-orange-100 via-rose-100 to-fuchsia-100 dark:from-orange-950 dark:via-rose-950 dark:to-fuchsia-950"><Utensils className="h-10 w-10 text-rose-500" /></div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-black text-slate-900 dark:text-white">{place.name}</h2>
                      {isProviderPlace && <span translate="no" style={{ fontFamily: 'Roboto, sans-serif' }} className="mt-1 inline-block whitespace-nowrap text-xs font-normal text-slate-500 dark:text-slate-400">Google Maps</span>}
                    </div>
                    <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{formatDistance(place.distance)}</span>
                  </div>
                  <p className="mt-2 inline-flex items-start gap-1.5 text-sm text-slate-500 dark:text-slate-400"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {place.location.address}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    {place.rating > 0 && <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Star className="h-3.5 w-3.5 fill-current" /> {Number(place.rating).toFixed(1)}{place.reviewCount > 0 ? ` · ${place.reviewCount}` : ''}</span>}
                    {place.openHours && <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${place.isOpenNow ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><Clock3 className="h-3.5 w-3.5" /> {place.openHours}</span>}
                    {place.priceRange && <span className="rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{place.priceRange}</span>}
                    {popular && <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-rose-700 dark:bg-rose-950 dark:text-rose-300"><Flame className="h-3.5 w-3.5" /> Được quan tâm</span>}
                    {newBadge && <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><CalendarClock className="h-3.5 w-3.5" /> {newBadge.label}</span>}
                  </div>
                  {place.foodTags && place.foodTags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{place.foodTags.map((tag) => <span key={tag} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tag}</span>)}</div>}
                  {place.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{place.description}</p>}
                  <button onClick={() => onSelect(place)} className="mt-4 min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 font-black text-white">Xem chi tiết trong TVU Connect</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
