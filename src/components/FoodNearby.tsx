import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarClock,
  Flame,
  Heart,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import { Place } from '../types';
import { calculateDistance, Coordinates, formatDistance } from '../utils/locationUtils';
import { discoverFoodPlaces } from '../services/foodDiscoveryService';

interface FoodNearbyProps {
  userLocation: Coordinates | null;
  locating: boolean;
  onRequestLocation: () => Promise<Coordinates | null>;
  onSelect: (place: Place & { distance?: number }) => void;
}

type FoodCategory = 'all' | 'meals' | 'coffee' | 'snacks' | 'dessert' | 'vegetarian';
type FoodSort = 'nearby' | 'hot' | 'rating' | 'new';

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

const SAVED_FOOD_KEY = 'tvu-connect:saved-food-places';

const placeKey = (place: Place) => place.id || `${place.name}:${place.location.lat}:${place.location.lng}`;

const readSavedPlaces = () => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_FOOD_KEY) || '[]');
    return new Set<string>(Array.isArray(value) ? value : []);
  } catch {
    return new Set<string>();
  }
};

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

const directFoodPlaces = (providerPlaces: Place[]) => providerPlaces
  .filter((place) => place.dataSource === 'google_places' && FOOD_CATEGORIES.has(place.category));

const providerErrorMessage = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('failed-precondition')) return 'Chưa cấu hình Google Places. Danh sách cộng đồng vẫn hoạt động bình thường.';
  if (code.includes('resource-exhausted')) return 'Đã đạt giới hạn làm mới tạm thời. Hãy dùng kết quả hiện tại.';
  return 'Nguồn địa điểm trực tiếp đang tạm bận. Đang hiển thị dữ liệu cộng đồng.';
};

export const FoodNearby: React.FC<FoodNearbyProps> = ({
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<Set<string>>(readSavedPlaces);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const origin = userLocation;

  const toggleSavedPlace = (place: Place) => {
    const key = placeKey(place);
    setSavedPlaces((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      window.localStorage.setItem(SAVED_FOOD_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const loadProviderPlaces = useCallback(async () => {
    if (!origin) {
      setProviderPlaces([]);
      setFetchedAt(null);
      setSourceError(null);
      setSourceLoading(false);
      return;
    }
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
  }, [origin]);

  useEffect(() => {
    void loadProviderPlaces();
  }, [loadProviderPlaces]);

  const results = useMemo(() => {
    if (!origin) return [];
    const keyword = normalizeText(search);
    const next = directFoodPlaces(providerPlaces)
      .map((place) => ({ ...place, distance: calculateDistance(origin, place.location) }))
      .filter((place) => place.distance <= radius)
      .filter((place) => categoryMatches(place, category))
      .filter((place) => !showSavedOnly || savedPlaces.has(placeKey(place)))
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
  }, [category, openNowOnly, origin, providerPlaces, radius, savedPlaces, search, showSavedOnly, sort]);

  const activeFilterCount = Number(openNowOnly) + Number(radius !== 5) + Number(sort !== 'nearby') + Number(showSavedOnly);

  return (
    <div className="h-full overflow-y-auto bg-[#f6f7f9] pb-24 dark:bg-slate-950">
      <section className="mx-auto max-w-5xl">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-3 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">Ăn gần</h1>
              <button type="button" disabled={locating} onClick={() => void onRequestLocation()} className="mt-0.5 flex max-w-full items-center gap-1 text-left text-xs font-bold text-slate-500 disabled:opacity-60 dark:text-slate-400">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                <span className="truncate">{userLocation ? 'Đang tìm quanh vị trí của bạn' : 'Chọn vị trí để xem quán gần nhất'}</span>
              </button>
            </div>
            <button type="button" disabled={locating} onClick={() => void onRequestLocation()} aria-label={userLocation ? 'Cập nhật vị trí' : 'Dùng vị trí của tôi'} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-violet-700 shadow-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-violet-300">
              <LocateFixed className={`h-5 w-5 ${locating ? 'animate-pulse' : ''}`} />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm món hoặc tên quán" className="min-h-12 w-full rounded-2xl border-0 bg-slate-100 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none ring-violet-500 placeholder:text-slate-400 focus:ring-2 dark:bg-slate-900 dark:text-white" />
            </label>
            <button type="button" onClick={() => setFiltersOpen(true)} className="relative inline-flex min-h-12 shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-black text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Bộ lọc</span>
              {activeFilterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-violet-600 px-1 text-[10px] text-white">{activeFilterCount}</span>}
            </button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            {CATEGORY_OPTIONS.map((option) => (
              <button key={option.value} type="button" onClick={() => setCategory(option.value)} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-extrabold transition ${category === option.value ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950' : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{option.label}</button>
            ))}
            <button type="button" onClick={() => setShowSavedOnly((value) => !value)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold transition ${showSavedOnly ? 'bg-rose-500 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}><Heart className={`h-3.5 w-3.5 ${showSavedOnly ? 'fill-current' : ''}`} /> Đã lưu</button>
          </div>
        </header>

        <div className="px-3 pt-3 sm:px-5">
          <div className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-xs ${sourceError ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400'}`}>
            <div className="flex min-w-0 items-center gap-2">
              {!userLocation ? <LocateFixed className="h-4 w-4 shrink-0 text-violet-600" /> : sourceLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />}
              <span className="truncate">{!userLocation ? 'Cần vị trí để tìm quán thật sự quanh bạn' : sourceLoading ? 'Đang cập nhật quán…' : sourceError || `${results.length} lựa chọn quanh bạn · Google Maps${fetchedAt ? ` · ${new Date(fetchedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ''}`}</span>
            </div>
            <button type="button" disabled={sourceLoading || !userLocation} onClick={() => void loadProviderPlaces()} aria-label="Làm mới danh sách quán" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-slate-100 disabled:opacity-35 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button>
          </div>

          {sort === 'hot' && <p className="mt-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0" /> Xếp hạng dựa trên điểm và lượng đánh giá của nguồn.</p>}

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {!userLocation ? (
              <div className="rounded-3xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 md:col-span-2">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300"><LocateFixed className="h-7 w-7" /></div>
                <p className="mt-4 font-black text-slate-900 dark:text-white">Bật vị trí để xem quán quanh bạn</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">TVU Connect chỉ dùng tọa độ hiện tại để tìm trong bán kính đã chọn.</p>
                <button type="button" disabled={locating} onClick={() => void onRequestLocation()} className="mt-4 min-h-11 rounded-xl bg-violet-600 px-5 text-sm font-black text-white disabled:opacity-60">{locating ? 'Đang lấy vị trí…' : 'Dùng vị trí hiện tại'}</button>
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-14 text-center dark:border-slate-700 dark:bg-slate-900 md:col-span-2">
                <Utensils className="mx-auto h-11 w-11 text-slate-300" />
                <p className="mt-3 font-bold text-slate-700 dark:text-slate-300">Không thấy quán phù hợp</p>
                <button type="button" onClick={() => { setCategory('all'); setOpenNowOnly(false); setShowSavedOnly(false); setRadius(10); setSearch(''); }} className="mt-3 text-sm font-black text-violet-700 dark:text-violet-300">Xóa bộ lọc</button>
              </div>
            ) : results.map((place) => {
              const newBadge = openingBadge(place.openingDate);
              const popular = Number(place.rating || 0) >= 4.2 && Number(place.reviewCount || 0) >= 50;
              const isProviderPlace = place.dataSource === 'google_places';
              const key = placeKey(place);
              const saved = savedPlaces.has(key);
              return (
                <article key={key} className="group relative flex min-h-40 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 sm:min-h-48">
                  <div className="relative w-[36%] min-w-[118px] sm:w-[40%]">
                    {place.images?.[0] && !isProviderPlace ? <img src={place.images[0]} alt={`Ảnh ${place.name}`} className="h-full w-full object-cover" /> : (
                      <div className="flex h-full min-h-40 items-center justify-center bg-[#fff4ed] dark:bg-orange-950/30"><Utensils className="h-9 w-9 text-orange-500" /></div>
                    )}
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-slate-950/80 px-2 py-1 text-[10px] font-black text-white backdrop-blur"><Navigation className="h-3 w-3" /> {formatDistance(place.distance)}</span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col p-3.5">
                    <div className="flex items-start gap-2">
                      <button type="button" onClick={() => onSelect(place)} className="min-w-0 flex-1 text-left">
                        <h2 className="line-clamp-2 text-[15px] font-black leading-snug text-slate-950 dark:text-white">{place.name}</h2>
                      </button>
                      <button type="button" onClick={() => toggleSavedPlace(place)} aria-label={saved ? `Bỏ lưu ${place.name}` : `Lưu ${place.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                        <Heart className={`h-4 w-4 ${saved ? 'fill-rose-500 text-rose-500' : ''}`} />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {place.rating > 0 && <span className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-200"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {Number(place.rating).toFixed(1)}{place.reviewCount > 0 ? ` (${place.reviewCount})` : ''}</span>}
                      {place.isOpenNow === true && <span className="text-emerald-600">Đang mở</span>}
                      {place.isOpenNow === false && <span className="text-slate-400">Đã đóng</span>}
                      {place.priceRange && <span>{place.priceRange}</span>}
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{place.location.address}</p>
                    <div className="mt-2 flex min-h-5 flex-wrap gap-1.5">
                      {popular && <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300"><Flame className="h-3 w-3" /> Nổi bật</span>}
                      {newBadge && <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300"><CalendarClock className="h-3 w-3" /> {newBadge.label}</span>}
                      {place.foodTags?.slice(0, 1).map((tag) => <span key={tag} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tag}</span>)}
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      {isProviderPlace ? <span translate="no" style={{ fontFamily: 'Roboto, sans-serif' }} className="text-[10px] text-slate-400">Google Maps</span> : <span className="text-[10px] font-bold text-violet-600">TVU Connect</span>}
                      <button aria-label="Xem chi tiết trong TVU Connect" onClick={() => onSelect(place)} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white shadow-sm">Xem quán</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {filtersOpen && (
        <div className="fixed inset-0 z-[10030] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" onClick={(event) => { if (event.target === event.currentTarget) setFiltersOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Bộ lọc quán ăn" className="w-full rounded-t-[2rem] bg-white p-5 shadow-2xl dark:bg-slate-900 sm:max-w-lg sm:rounded-[2rem]">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden dark:bg-slate-700" />
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-950 dark:text-white">Lọc quán</h2>
              <button type="button" onClick={() => { setRadius(5); setSort('nearby'); setOpenNowOnly(false); setShowSavedOnly(false); }} className="text-sm font-bold text-violet-700 dark:text-violet-300">Đặt lại</button>
            </div>

            <div className="mt-5">
              <p className="text-sm font-black text-slate-900 dark:text-white">Sắp xếp</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {SORT_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => setSort(option.value)} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold ${sort === option.value ? 'border-violet-600 bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{option.label}</button>)}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-sm font-black text-slate-900 dark:text-white">Khoảng cách</p>
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {[1, 3, 5, 10].map((value) => <button key={value} type="button" onClick={() => setRadius(value as 1 | 3 | 5 | 10)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${radius === value ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{value} km</button>)}
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer items-center justify-between rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800">
              <span className="font-bold text-slate-800 dark:text-slate-200">Chỉ quán đang mở</span>
              <input type="checkbox" checked={openNowOnly} onChange={(event) => setOpenNowOnly(event.target.checked)} className="h-5 w-5 accent-violet-600" />
            </label>

            <button type="button" onClick={() => setFiltersOpen(false)} className="mt-5 min-h-12 w-full rounded-2xl bg-violet-600 font-black text-white">Xem {results.length} quán</button>
          </section>
        </div>
      )}
    </div>
  );
};
