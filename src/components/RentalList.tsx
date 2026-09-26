import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { RentalPost, RentalType } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'sonner';
import { Plus, X, Phone, MapPin, Wifi, Wind, Bath, Car, WashingMachine, Home, Search, Trash2, Building2, Users, Hotel, Info, LocateFixed, Copy, Heart, SlidersHorizontal, ArrowUpDown, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { calculateDistance, Coordinates, formatDistance } from '../utils/locationUtils';
import { CommunityReviews } from './CommunityReviews';
import { subscribeToNearbyRentals } from '../services/rentalSearchService';
import { createRentalGeohash } from '../utils/rentalGeo';
import { InlineLocationMap } from './InlineLocationMap';

interface RentalListProps {
  currentUser: User;
  userLocation: Coordinates | null;
  locating: boolean;
  onRequestLocation: () => Promise<Coordinates | null>;
}

const RENTAL_TYPE_LABELS: Record<RentalType, string> = {
  'nha-tro':   'Nhà trọ',
  'o-ghep':    'Ở ghép',
  'nha-nghi':  'Nhà nghỉ',
  'khach-san': 'Khách sạn',
  'khac':      'Khác',
};

const RENTAL_TYPE_ICONS: Record<string, React.ReactNode> = {
  'all':       <Home className="w-3.5 h-3.5" />,
  'nha-tro':   <Building2 className="w-3.5 h-3.5" />,
  'o-ghep':    <Users className="w-3.5 h-3.5" />,
  'nha-nghi':  <Hotel className="w-3.5 h-3.5" />,
  'khach-san': <Hotel className="w-3.5 h-3.5" />,
  'khac':      <Home className="w-3.5 h-3.5" />,
};

const AMENITY_ICONS: Record<string, { icon: React.ReactNode; label: string }> = {
  'wifi':              { icon: <Wifi className="w-3 h-3" />,           label: 'Wifi' },
  'dieu-hoa':          { icon: <Wind className="w-3 h-3" />,           label: 'Điều hoà' },
  'nha-ve-sinh-rieng': { icon: <Bath className="w-3 h-3" />,           label: 'WC riêng' },
  'giu-xe':            { icon: <Car className="w-3 h-3" />,            label: 'Giữ xe' },
  'may-giat':          { icon: <WashingMachine className="w-3 h-3" />, label: 'Máy giặt' },
};

const AMENITY_OPTIONS = [
  { key: 'wifi',              label: 'Wifi' },
  { key: 'dieu-hoa',          label: 'Điều hoà' },
  { key: 'nha-ve-sinh-rieng', label: 'WC riêng' },
  { key: 'giu-xe',            label: 'Giữ xe' },
  { key: 'may-giat',          label: 'Máy giặt' },
];

type PriceFilter = 'all' | 'duoi-1-5' | '1-5-den-2-5' | 'tren-2-5';
type RentalSort = 'recommended' | 'nearest' | 'price-asc' | 'newest';

const RENTAL_SORT_OPTIONS: Array<{ value: RentalSort; label: string }> = [
  { value: 'recommended', label: 'Phù hợp nhất' },
  { value: 'nearest', label: 'Gần nhất' },
  { value: 'price-asc', label: 'Giá thấp trước' },
  { value: 'newest', label: 'Tin mới nhất' },
];

const SAVED_RENTALS_KEY = 'tvu-connect:saved-rentals';

const readSavedRentals = () => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_RENTALS_KEY) || '[]');
    return new Set<string>(Array.isArray(value) ? value : []);
  } catch {
    return new Set<string>();
  }
};

const timestampValue = (value: unknown) => {
  if (!value || typeof value !== 'object') return 0;
  if ('toMillis' in value && typeof value.toMillis === 'function') return value.toMillis();
  if ('seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const formatPrice = (price: number): string => {
  if (price >= 1_000_000) {
    const val = price / 1_000_000;
    return `${val % 1 === 0 ? val : val.toFixed(1)} triệu/tháng`;
  }
  return `${(price / 1000).toFixed(0)}k/tháng`;
};

const formatVnd = (amount: number): string => new Intl.NumberFormat('vi-VN').format(amount) + 'đ';

interface PostFormState {
  title: string;
  type: RentalType;
  price: string;
  area: string;
  address: string;
  description: string;
  contactName: string;
  contactPhone: string;
  amenities: string[];
  deposit: string;
  electricityPrice: string;
  waterPrice: string;
  genderPreference: 'any' | 'male' | 'female';
  availableFrom: string;
  utilitiesNote: string;
  latitude: string;
  longitude: string;
}

const INITIAL_FORM: PostFormState = {
  title: '',
  type: 'nha-tro',
  price: '',
  area: '',
  address: '',
  description: '',
  contactName: '',
  contactPhone: '',
  amenities: [],
  deposit: '',
  electricityPrice: '',
  waterPrice: '',
  genderPreference: 'any',
  availableFrom: '',
  utilitiesNote: '',
  latitude: '',
  longitude: '',
};

// Gradient chính của nền tảng TVU Connect
const GRADIENT_MAIN = 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)';
const GRADIENT_DARK = 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)';

export const RentalList: React.FC<RentalListProps> = ({ currentUser, userLocation, locating, onRequestLocation }) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<RentalType | 'all'>('all');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [showModal, setShowModal] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<RentalSort>('recommended');
  const [savedRentals, setSavedRentals] = useState<Set<string>>(readSavedRentals);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [form, setForm] = useState<PostFormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<PostFormState>>({});
  const [locationError, setLocationError] = useState<string | null>(null);
  const [radius, setRadius] = useState<1 | 3 | 5 | 10>(5);
  const [selectedPost, setSelectedPost] = useState<(RentalPost & { distance?: number }) | null>(null);
  const [nearbyPosts, setNearbyPosts] = useState<RentalPost[] | null>(null);
  const [isNearbyLoading, setIsNearbyLoading] = useState(false);

  useEffect(() => {
    if (!userLocation) {
      setNearbyPosts(null);
      setIsNearbyLoading(false);
      return;
    }

    setIsNearbyLoading(true);
    const unsubscribe = subscribeToNearbyRentals(
      userLocation,
      radius,
      (nextPosts) => {
        setNearbyPosts(nextPosts);
        setIsNearbyLoading(false);
      },
      (error) => {
        console.error('Error loading nearby rentals:', error);
        setIsNearbyLoading(false);
        toast.error('Không thể cập nhật trọ quanh vị trí hiện tại.');
      },
    );

    return unsubscribe;
  }, [radius, userLocation]);

  const sourcePosts = useMemo(() => {
    if (!userLocation) return [];
    return nearbyPosts || [];
  }, [nearbyPosts, userLocation]);

  const filteredPosts = useMemo(() => sourcePosts
    .map((post) => ({
      ...post,
      distance: userLocation && post.location
        ? calculateDistance(userLocation, post.location)
        : undefined,
    }))
    .filter((post) => {
      if (post.isAvailable === false) return false;
      if (showSavedOnly && (!post.id || !savedRentals.has(post.id))) return false;
      if (typeFilter !== 'all' && post.type !== typeFilter) return false;
      if (priceFilter === 'duoi-1-5' && post.price >= 1_500_000) return false;
      if (priceFilter === '1-5-den-2-5' && (post.price < 1_500_000 || post.price > 2_500_000)) return false;
      if (priceFilter === 'tren-2-5' && post.price <= 2_500_000) return false;
      if (post.distance === undefined || post.distance > radius) return false;
      if (searchQuery.trim()) {
        const keyword = searchQuery.toLocaleLowerCase('vi');
        return [post.title, post.address, post.district, post.description, post.utilitiesNote, post.genderPreference]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('vi').includes(keyword));
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'newest') return timestampValue(b.createdAt) - timestampValue(a.createdAt);
      if (sort === 'nearest') return (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY);
      const completeness = (post: RentalPost) => Number(Boolean(post.images?.length)) * 3
        + Number(Boolean(post.location)) * 2
        + Math.min(post.amenities?.length || 0, 4)
        + Number(Boolean(post.deposit))
        + Number(Boolean(post.electricityPrice || post.waterPrice));
      return completeness(b) - completeness(a)
        || (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY)
        || timestampValue(b.createdAt) - timestampValue(a.createdAt);
    }), [priceFilter, radius, savedRentals, searchQuery, showSavedOnly, sort, sourcePosts, typeFilter, userLocation]);

  const listLoading = Boolean(userLocation) && isNearbyLoading;

  const updateCurrentLocation = async (forListing = false) => {
    const coordinates = await onRequestLocation();
    if (coordinates && forListing) {
      setForm((current) => ({
        ...current,
        latitude: coordinates.lat.toFixed(6),
        longitude: coordinates.lng.toFixed(6),
      }));
      setLocationError(null);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa tin này?')) return;
    try {
      await deleteDoc(doc(db, 'rentalPosts', postId));
      toast.success('Đã xóa tin trọ');
    } catch (err) {
      console.error(err);
      toast.error('Xóa tin thất bại');
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<PostFormState> = {};
    let nextLocationError: string | null = null;
    if (!form.title.trim()) errors.title = 'Vui lòng nhập tiêu đề';
    else if (form.title.trim().length > 120) errors.title = 'Tiêu đề tối đa 120 ký tự';
    if (!form.address.trim()) errors.address = 'Vui lòng nhập địa chỉ';
    const phone = form.contactPhone.replace(/[\s.-]/g, '');
    if (!phone) errors.contactPhone = 'Vui lòng nhập số điện thoại';
    else if (!/^0\d{9,10}$/.test(phone)) errors.contactPhone = 'Nhập số điện thoại Việt Nam hợp lệ (10–11 số)';
    if (!form.price.trim() || isNaN(Number(form.price)) || Number(form.price) <= 0)
      errors.price = 'Vui lòng nhập giá hợp lệ';
    if (form.area && (!Number.isFinite(Number(form.area)) || Number(form.area) <= 0))
      errors.area = 'Diện tích phải lớn hơn 0';
    if (form.deposit && (!Number.isFinite(Number(form.deposit)) || Number(form.deposit) < 0))
      errors.deposit = 'Tiền cọc không hợp lệ';
    if (form.electricityPrice && (!Number.isFinite(Number(form.electricityPrice)) || Number(form.electricityPrice) < 0))
      errors.electricityPrice = 'Giá điện không hợp lệ';
    if (form.waterPrice && (!Number.isFinite(Number(form.waterPrice)) || Number(form.waterPrice) < 0))
      errors.waterPrice = 'Giá nước không hợp lệ';
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!form.latitude || !form.longitude) {
      nextLocationError = 'Hãy ghim vị trí để sinh viên có thể tìm trọ quanh đây.';
    } else if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 9.4 || latitude > 10.2 || longitude < 105.8 || longitude > 106.8) {
      nextLocationError = 'Tọa độ chưa hợp lệ hoặc nằm ngoài khu vực Trà Vinh mở rộng.';
    }
    setFormErrors(errors);
    setLocationError(nextLocationError);
    return Object.keys(errors).length === 0 && !nextLocationError;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    const phone = form.contactPhone.replace(/[\s.-]/g, '');
    setIsSubmitting(true);
    try {
      const location = {
        lat: Number(form.latitude),
        lng: Number(form.longitude),
      };
      const postData = {
        title: form.title.trim(),
        type: form.type,
        price: Number(form.price),
        ...(form.area ? { area: Number(form.area) } : {}),
        address: form.address.trim(),
        location,
        geohash: createRentalGeohash(location),
        description: form.description.trim(),
        contactName: form.contactName.trim() || currentUser.displayName || '',
        contactPhone: phone,
        amenities: form.amenities,
        ...(form.deposit ? { deposit: Number(form.deposit) } : {}),
        ...(form.electricityPrice ? { electricityPrice: Number(form.electricityPrice) } : {}),
        ...(form.waterPrice ? { waterPrice: Number(form.waterPrice) } : {}),
        genderPreference: form.genderPreference,
        ...(form.availableFrom ? { availableFrom: form.availableFrom } : {}),
        ...(form.utilitiesNote.trim() ? { utilitiesNote: form.utilitiesNote.trim().slice(0, 300) } : {}),
        isAvailable: true,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'rentalPosts'), postData);
      toast.success('Đăng tin thành công!');
      setShowModal(false);
      setForm(INITIAL_FORM);
      setFormErrors({});
      setLocationError(null);
    } catch (err) {
      console.error(err);
      toast.error('Đăng tin thất bại, vui lòng thử lại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAmenity = (key: string) => {
    setForm(prev => ({
      ...prev,
      amenities: prev.amenities.includes(key)
        ? prev.amenities.filter(a => a !== key)
        : [...prev.amenities, key],
    }));
  };

  const copyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success('Đã sao chép số điện thoại.');
    } catch {
      toast.error(`Không thể sao chép tự động. Số liên hệ: ${phone}`);
    }
  };

  const toggleSavedRental = (post: RentalPost) => {
    if (!post.id) return;
    setSavedRentals((current) => {
      const next = new Set(current);
      if (next.has(post.id!)) next.delete(post.id!);
      else next.add(post.id!);
      window.localStorage.setItem(SAVED_RENTALS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const isDark = theme === 'dark';
  const gradient = isDark ? GRADIENT_DARK : GRADIENT_MAIN;
  const cardBg = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
    isDark
      ? 'bg-gray-700/60 border-gray-600 text-white placeholder-gray-400 focus:border-purple-400 focus:ring-1 focus:ring-purple-400/30'
      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20'
  }`;
  const activeFilterCount = Number(typeFilter !== 'all') + Number(priceFilter !== 'all') + Number(radius !== 5) + Number(showSavedOnly);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">

      <header className={`flex-shrink-0 border-b px-3 pb-3 pt-3 sm:px-5 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className={`text-xl font-black tracking-tight ${textPrimary}`}>Tìm trọ</h1>
            <button type="button" disabled={locating} onClick={() => void updateCurrentLocation(false)} className={`mt-0.5 flex max-w-full items-center gap-1 text-left text-xs font-bold disabled:opacity-60 ${textSecondary}`}>
              <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-600" />
              <span className="truncate">{userLocation ? 'Đang ưu tiên phòng gần bạn' : 'Bật vị trí để xem phòng gần nhất'}</span>
            </button>
          </div>
          <button type="button" onClick={() => setShowModal(true)} className="hidden min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-3 text-sm font-black text-white sm:inline-flex"><Plus className="h-4 w-4" /> Đăng tin</button>
        </div>

        <div className="mt-3 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Tìm tên trọ hoặc khu vực" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={`min-h-12 w-full rounded-2xl border-0 pl-10 pr-9 text-sm font-medium outline-none ring-violet-500 focus:ring-2 ${isDark ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-slate-100 text-slate-900 placeholder-slate-400'}`} />
            {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Xóa nội dung tìm kiếm" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="h-4 w-4" /></button>}
          </label>
          <button type="button" onClick={() => setFiltersOpen(true)} className={`relative inline-flex min-h-12 shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-sm font-black shadow-sm ${isDark ? 'border-gray-700 bg-gray-800 text-gray-200' : 'border-slate-200 bg-white text-slate-700'}`}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Bộ lọc</span>
            {activeFilterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-violet-600 px-1 text-[10px] text-white">{activeFilterCount}</span>}
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {(['all', 'nha-tro', 'o-ghep', 'nha-nghi', 'khach-san', 'khac'] as const).map(t => {
            const isActive = typeFilter === t;
            return <button key={t} type="button" onClick={() => setTypeFilter(t)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold ${isActive ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : isDark ? 'border border-gray-700 bg-gray-800 text-gray-300' : 'border border-slate-200 bg-white text-slate-600'}`}>{RENTAL_TYPE_ICONS[t]} {t === 'all' ? 'Tất cả' : RENTAL_TYPE_LABELS[t as RentalType]}</button>;
          })}
          <button type="button" onClick={() => setShowSavedOnly((value) => !value)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold ${showSavedOnly ? 'bg-rose-500 text-white' : isDark ? 'border border-gray-700 bg-gray-800 text-gray-300' : 'border border-slate-200 bg-white text-slate-600'}`}><Heart className={`h-3.5 w-3.5 ${showSavedOnly ? 'fill-current' : ''}`} /> Đã lưu</button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className={`text-xs font-bold ${textSecondary}`}>{filteredPosts.length} chỗ ở phù hợp</p>
          <button type="button" onClick={() => setFiltersOpen(true)} className={`inline-flex items-center gap-1 text-xs font-black ${textPrimary}`}><ArrowUpDown className="h-3.5 w-3.5" /> {RENTAL_SORT_OPTIONS.find((option) => option.value === sort)?.label}</button>
        </div>
      </header>

      {/* ── Posts list ── */}
      <div className={`flex-1 overflow-y-auto p-3 pb-24 ${isDark ? 'bg-gray-950' : 'bg-[#f6f7f9]'}`}>
        <div className="mx-auto w-full max-w-5xl space-y-3">

        <div className={`flex items-start gap-2 rounded-2xl px-3.5 py-3 text-xs leading-relaxed ${isDark ? 'bg-amber-950/30 text-amber-200' : 'bg-amber-50 text-amber-900'}`}>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Không chuyển cọc trước khi xem phòng và xác minh người đăng. Giá điện, nước và tiền cọc nên được ghi rõ.</span>
        </div>

        {/* Loading skeleton */}
        {listLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className={`${cardBg} border rounded-2xl p-4 animate-pulse`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-gray-700 rounded-xl flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded-full mb-2" />
                    <div className="h-3 w-1/3 bg-gray-100 dark:bg-gray-700 rounded-full" />
                  </div>
                </div>
                <div className="h-5 w-1/2 bg-gray-200 dark:bg-gray-700 rounded-full mb-3" />
                <div className="h-3 w-full bg-gray-100 dark:bg-gray-700 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!listLoading && filteredPosts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <Home className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className={`text-base font-bold mb-2 ${textPrimary}`}>
              {!userLocation ? 'Bật vị trí để tìm trọ quanh bạn' : searchQuery || typeFilter !== 'all' || priceFilter !== 'all' || radius !== 5
                ? 'Không tìm thấy tin phù hợp'
                : 'Chưa có tin trọ nào'}
            </h3>
            <p className={`text-sm ${textSecondary}`}>
              {!userLocation ? 'TVU Connect không hiển thị toàn bộ kho tin khi chưa có vị trí của bạn.' : searchQuery || typeFilter !== 'all' || priceFilter !== 'all' || radius !== 5
                ? 'Thử thay đổi bộ lọc để tìm kết quả khác'
                : 'Hãy là người đầu tiên đăng tin tìm trọ!'}
            </p>
            {!userLocation && <button type="button" disabled={locating} onClick={() => void updateCurrentLocation(false)} className="mt-4 min-h-11 rounded-xl bg-violet-600 px-5 text-sm font-black text-white disabled:opacity-60">{locating ? 'Đang lấy vị trí…' : 'Dùng vị trí hiện tại'}</button>}
          </div>
        )}

        {/* Rental cards */}
        {!listLoading && filteredPosts.map(post => {
          const saved = Boolean(post.id && savedRentals.has(post.id));
          const primaryImage = post.images?.[0];
          return (
            <article key={post.id} className={`${cardBg} flex overflow-hidden rounded-3xl border shadow-[0_8px_30px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-lg`}>
              <div className={`relative w-[34%] min-w-[118px] sm:w-52 ${isDark ? 'bg-gray-700' : 'bg-slate-100'}`}>
                {primaryImage ? <img src={primaryImage} alt={`Ảnh ${post.title}`} className="h-full min-h-52 w-full object-cover" /> : (
                  <div className="flex h-full min-h-52 flex-col items-center justify-center px-3 text-center">
                    <ImageIcon className={`h-8 w-8 ${isDark ? 'text-gray-500' : 'text-slate-300'}`} />
                    <span className={`mt-2 text-[10px] font-bold ${textSecondary}`}>Chưa có ảnh</span>
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-slate-950/75 px-2 py-1 text-[10px] font-black text-white backdrop-blur">{RENTAL_TYPE_LABELS[post.type]}</span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4">
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => setSelectedPost(post)} className="min-w-0 flex-1 text-left">
                    <h3 className={`line-clamp-2 text-[15px] font-black leading-snug sm:text-base ${textPrimary}`}>{post.title}</h3>
                  </button>
                  <button type="button" onClick={() => toggleSavedRental(post)} aria-label={saved ? `Bỏ lưu ${post.title}` : `Lưu ${post.title}`} className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-slate-100 text-slate-500'}`}><Heart className={`h-4 w-4 ${saved ? 'fill-rose-500 text-rose-500' : ''}`} /></button>
                  {post.createdBy === currentUser.uid && <button type="button" onClick={() => handleDelete(post.id!)} aria-label={`Xóa ${post.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>}
                </div>

                <p className="mt-2 text-lg font-black text-violet-700 dark:text-violet-300">{formatPrice(post.price)}</p>
                <div className={`mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed ${textSecondary}`}><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" /><span className="line-clamp-2">{post.address}</span></div>

                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
                  {post.area && <span className={`rounded-md px-2 py-1 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>{post.area} m²</span>}
                  {post.distance !== undefined && <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><LocateFixed className="mr-1 inline h-3 w-3" />{formatDistance(post.distance)}</span>}
                  {post.deposit ? <span className={`rounded-md px-2 py-1 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>Cọc {formatVnd(post.deposit)}</span> : null}
                  {post.genderPreference && post.genderPreference !== 'any' ? <span className={`rounded-md px-2 py-1 ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>{post.genderPreference === 'male' ? 'Nam' : 'Nữ'}</span> : null}
                </div>

                {post.amenities?.length > 0 && <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">{post.amenities.slice(0, 3).map((amenity) => AMENITY_ICONS[amenity] ? <span key={amenity} className={`inline-flex items-center gap-1 text-[10px] font-bold ${textSecondary}`}>{AMENITY_ICONS[amenity].icon}{AMENITY_ICONS[amenity].label}</span> : null)}{post.amenities.length > 3 && <span className={`text-[10px] font-bold ${textSecondary}`}>+{post.amenities.length - 3}</span>}</div>}

                <div className="mt-auto grid grid-cols-[1fr_auto] gap-2 pt-3">
                  <button type="button" onClick={() => setSelectedPost(post)} className="min-h-10 rounded-xl bg-violet-600 px-3 text-xs font-black text-white">Xem chi tiết</button>
                  <a href={`tel:${post.contactPhone}`} aria-label={`Gọi ${post.contactName || post.title}`} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-black ${isDark ? 'border-gray-600 text-gray-200' : 'border-slate-200 text-slate-700'}`}><Phone className="h-4 w-4" /><span className="hidden sm:inline">Gọi</span></a>
                </div>
              </div>
            </article>
          );
        })}
        </div>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-[10030] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" onClick={(event) => { if (event.target === event.currentTarget) setFiltersOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Bộ lọc tìm trọ" className={`max-h-[90dvh] w-full overflow-y-auto rounded-t-[2rem] p-5 shadow-2xl sm:max-w-lg sm:rounded-[2rem] ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 sm:hidden dark:bg-slate-700" />
            <div className="flex items-center justify-between gap-3">
              <h2 className={`text-xl font-black ${textPrimary}`}>Lọc chỗ ở</h2>
              <button type="button" onClick={() => { setTypeFilter('all'); setPriceFilter('all'); setRadius(5); setSort('recommended'); setShowSavedOnly(false); }} className="text-sm font-bold text-violet-700 dark:text-violet-300">Đặt lại</button>
            </div>

            <div className="mt-5">
              <p className={`text-sm font-black ${textPrimary}`}>Sắp xếp</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {RENTAL_SORT_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => setSort(option.value)} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold ${sort === option.value ? 'border-violet-600 bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200' : isDark ? 'border-gray-700 text-gray-300' : 'border-slate-200 text-slate-600'}`}>{option.label}</button>)}
              </div>
            </div>

            <div className="mt-5">
              <p className={`text-sm font-black ${textPrimary}`}>Mức giá mỗi tháng</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  { key: 'all', label: 'Mọi mức giá' },
                  { key: 'duoi-1-5', label: 'Dưới 1,5 triệu' },
                  { key: '1-5-den-2-5', label: '1,5–2,5 triệu' },
                  { key: 'tren-2-5', label: 'Trên 2,5 triệu' },
                ] as const).map((option) => <button key={option.key} type="button" onClick={() => setPriceFilter(option.key)} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold ${priceFilter === option.key ? 'border-violet-600 bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200' : isDark ? 'border-gray-700 text-gray-300' : 'border-slate-200 text-slate-600'}`}>{option.label}</button>)}
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <p className={`text-sm font-black ${textPrimary}`}>Khoảng cách</p>
                <button type="button" disabled={locating} onClick={() => void updateCurrentLocation(false)} className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 disabled:opacity-50 dark:text-emerald-300"><LocateFixed className={`h-3.5 w-3.5 ${locating ? 'animate-pulse' : ''}`} /> {userLocation ? 'Cập nhật vị trí' : 'Bật vị trí'}</button>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {([1, 3, 5, 10] as const).map((value) => <button key={value} type="button" disabled={!userLocation} onClick={() => setRadius(value)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-35 ${radius === value ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : isDark ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-slate-600'}`}>{value} km</button>)}
              </div>
            </div>

            <label className={`mt-5 flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3 ${isDark ? 'bg-gray-800' : 'bg-slate-100'}`}>
              <span className={`inline-flex items-center gap-2 font-bold ${textPrimary}`}><Heart className="h-4 w-4 text-rose-500" /> Chỉ tin đã lưu</span>
              <input type="checkbox" checked={showSavedOnly} onChange={(event) => setShowSavedOnly(event.target.checked)} className="h-5 w-5 accent-violet-600" />
            </label>

            <button type="button" onClick={() => setFiltersOpen(false)} className="mt-6 min-h-12 w-full rounded-2xl bg-violet-600 font-black text-white">Xem {filteredPosts.length} chỗ ở</button>
          </section>
        </div>
      )}

      {/* Chi tiết và đánh giá đều hiển thị nội bộ, không điều hướng sang web khác. */}
      {selectedPost && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-950/65 p-0 sm:p-4" onClick={(event) => { if (event.target === event.currentTarget) setSelectedPost(null); }}>
          <div className={`w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-black uppercase tracking-wider text-purple-500">{RENTAL_TYPE_LABELS[selectedPost.type]}</p><h2 className={`mt-1 text-2xl font-black ${textPrimary}`}>{selectedPost.title}</h2></div>
                <button onClick={() => setSelectedPost(null)} className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-600'}`} aria-label="Đóng"><X className="w-5 h-5" /></button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-black">{formatPrice(selectedPost.price)}</span>
                {selectedPost.area && <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-sm font-bold text-slate-600 dark:text-slate-200">{selectedPost.area} m²</span>}
                {selectedPost.distance !== undefined && <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-sm font-bold text-emerald-700 dark:text-emerald-300"><LocateFixed className="w-4 h-4 inline mr-1" />{formatDistance(selectedPost.distance)}</span>}
              </div>

              <p className={`mt-4 flex items-start gap-2 text-sm ${textSecondary}`}><MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-purple-500" />{selectedPost.address}</p>
              {selectedPost.location && (
                <InlineLocationMap
                  latitude={selectedPost.location.lat}
                  longitude={selectedPost.location.lng}
                  title={selectedPost.title}
                  address={selectedPost.address}
                />
              )}
              {selectedPost.description && <p className={`mt-4 text-sm leading-relaxed whitespace-pre-wrap ${textSecondary}`}>{selectedPost.description}</p>}

              <div className={`mt-4 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm ${isDark ? 'bg-gray-700/60 text-gray-200' : 'bg-slate-50 text-slate-700'}`}>
                {selectedPost.deposit ? <span>Tiền cọc: <strong>{formatVnd(selectedPost.deposit)}</strong></span> : null}
                {selectedPost.electricityPrice ? <span>Điện: <strong>{formatVnd(selectedPost.electricityPrice)}/kWh</strong></span> : null}
                {selectedPost.waterPrice ? <span>Nước: <strong>{formatVnd(selectedPost.waterPrice)}</strong></span> : null}
                {selectedPost.availableFrom ? <span>Nhận phòng: <strong>{new Date(`${selectedPost.availableFrom}T00:00:00`).toLocaleDateString('vi-VN')}</strong></span> : null}
                {selectedPost.utilitiesNote ? <span className="sm:col-span-2">Chi phí khác: <strong>{selectedPost.utilitiesNote}</strong></span> : null}
              </div>

              <div className={`mt-4 rounded-2xl border p-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <p className={`text-xs font-bold uppercase ${textSecondary}`}>Liên hệ được hiển thị ngay trong web</p>
                <p className={`mt-1 font-black ${textPrimary}`}><Phone className="w-4 h-4 inline mr-2" />{selectedPost.contactName || 'Người đăng'} · {selectedPost.contactPhone}</p>
                <button onClick={() => void copyPhone(selectedPost.contactPhone)} className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-black inline-flex items-center gap-2"><Copy className="w-4 h-4" /> Sao chép số</button>
              </div>

              {selectedPost.id && <CommunityReviews targetKind="rental" targetId={selectedPost.id} currentUser={currentUser} />}
            </div>
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <button
        onClick={() => setShowModal(true)}
        className="absolute bottom-5 right-5 z-10 flex items-center gap-2 rounded-full bg-violet-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:opacity-90 active:scale-95 sm:hidden"
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm">Đăng tin</span>
      </button>

      {/* ── Post Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setLocationError(null); } }}
        >
          <div
            className={`w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col ${
              isDark ? 'bg-gray-800' : 'bg-white'
            }`}
            style={{ maxHeight: '92dvh' }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ background: gradient }}
            >
              <div className="flex items-center gap-2 text-white">
                <Home className="w-5 h-5" />
                <h2 className="font-bold text-base">Đăng tin tìm trọ</h2>
              </div>
              <button
                onClick={() => { setShowModal(false); setForm(INITIAL_FORM); setFormErrors({}); setLocationError(null); }}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Tiêu đề */}
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                  Tiêu đề <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="VD: Phòng trọ giá rẻ gần TVU..."
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className={inputClass}
                />
                {formErrors.title && <p className="text-red-500 text-xs mt-1">{formErrors.title}</p>}
              </div>

              {/* Loại & Giá */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                    Loại <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.type}
                    onChange={e => setForm(p => ({ ...p, type: e.target.value as RentalType }))}
                    className={inputClass}
                  >
                    {(Object.keys(RENTAL_TYPE_LABELS) as RentalType[]).map(t => (
                      <option key={t} value={t}>
                        {RENTAL_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                    Giá/tháng (VNĐ) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="VD: 1500000"
                    value={form.price}
                    onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                    className={inputClass}
                    min="0"
                  />
                  {formErrors.price && <p className="text-red-500 text-xs mt-1">{formErrors.price}</p>}
                </div>
              </div>

              {/* Diện tích & SĐT */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                    Diện tích (m²)
                  </label>
                  <input
                    type="number"
                    placeholder="VD: 20"
                    value={form.area}
                    onChange={e => setForm(p => ({ ...p, area: e.target.value }))}
                    className={inputClass}
                    min="0"
                  />
                  {formErrors.area && <p className="text-red-500 text-xs mt-1">{formErrors.area}</p>}
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                    SĐT liên hệ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="0xxx xxx xxx"
                    value={form.contactPhone}
                    onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))}
                    className={inputClass}
                  />
                  {formErrors.contactPhone && <p className="text-red-500 text-xs mt-1">{formErrors.contactPhone}</p>}
                </div>
              </div>

              {/* Địa chỉ */}
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                  Địa chỉ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Số nhà, đường, phường/xã..."
                  value={form.address}
                  onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  className={inputClass}
                />
                {formErrors.address && <p className="text-red-500 text-xs mt-1">{formErrors.address}</p>}
              </div>

              <div className={`rounded-2xl border p-4 ${isDark ? 'border-gray-700 bg-gray-900/30' : 'border-indigo-100 bg-indigo-50/60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className={`text-sm font-black ${textPrimary}`}>Ghim vị trí phòng trọ <span className="text-red-500">*</span></p><p className={`mt-1 text-xs ${textSecondary}`}>Đứng tại phòng trọ rồi lấy vị trí, hoặc nhập tọa độ chính xác.</p></div>
                  <button type="button" disabled={locating} onClick={() => void updateCurrentLocation(true)} className="flex-shrink-0 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black inline-flex items-center gap-1.5 disabled:opacity-60"><LocateFixed className={`w-4 h-4 ${locating ? 'animate-pulse' : ''}`} /> Vị trí hiện tại</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className={`text-xs font-semibold ${textSecondary}`}>Vĩ độ
                    <input type="number" step="any" value={form.latitude} onChange={(event) => { setForm((current) => ({ ...current, latitude: event.target.value })); setLocationError(null); }} placeholder="9.934500" className={`${inputClass} mt-1`} />
                  </label>
                  <label className={`text-xs font-semibold ${textSecondary}`}>Kinh độ
                    <input type="number" step="any" value={form.longitude} onChange={(event) => { setForm((current) => ({ ...current, longitude: event.target.value })); setLocationError(null); }} placeholder="106.346100" className={`${inputClass} mt-1`} />
                  </label>
                </div>
                {locationError && <p className="mt-2 text-xs font-semibold text-red-500">{locationError}</p>}
              </div>

              {/* Tên liên hệ */}
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                  Tên liên hệ
                </label>
                <input
                  type="text"
                  placeholder="Tên chủ trọ hoặc người liên hệ"
                  value={form.contactName}
                  onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Tiền cọc (VNĐ)</label>
                  <input type="number" min="0" placeholder="VD: 1000000" value={form.deposit} onChange={e => setForm(p => ({ ...p, deposit: e.target.value }))} className={inputClass} />
                  {formErrors.deposit && <p className="text-red-500 text-xs mt-1">{formErrors.deposit}</p>}
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Có thể vào ở từ</label>
                  <input type="date" value={form.availableFrom} onChange={e => setForm(p => ({ ...p, availableFrom: e.target.value }))} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Điện/kWh</label>
                  <input type="number" min="0" placeholder="3500" value={form.electricityPrice} onChange={e => setForm(p => ({ ...p, electricityPrice: e.target.value }))} className={inputClass} />
                  {formErrors.electricityPrice && <p className="text-red-500 text-xs mt-1">{formErrors.electricityPrice}</p>}
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Nước</label>
                  <input type="number" min="0" placeholder="10000" value={form.waterPrice} onChange={e => setForm(p => ({ ...p, waterPrice: e.target.value }))} className={inputClass} />
                  {formErrors.waterPrice && <p className="text-red-500 text-xs mt-1">{formErrors.waterPrice}</p>}
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Phù hợp</label>
                  <select value={form.genderPreference} onChange={e => setForm(p => ({ ...p, genderPreference: e.target.value as PostFormState['genderPreference'] }))} className={inputClass}>
                    <option value="any">Mọi người</option>
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </div>
              </div>

              {/* Mô tả */}
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>
                  Mô tả
                </label>
                <textarea
                  placeholder="Thêm thông tin chi tiết về phòng trọ..."
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${textSecondary}`}>Ghi chú chi phí khác</label>
                <input
                  type="text"
                  maxLength={300}
                  placeholder="VD: Wifi 50k/người, rác 20k/tháng..."
                  value={form.utilitiesNote}
                  onChange={e => setForm(p => ({ ...p, utilitiesNote: e.target.value }))}
                  className={inputClass}
                />
              </div>

              {/* Tiện ích checkboxes */}
              <div>
                <label className={`block text-xs font-semibold mb-2 ${textSecondary}`}>
                  Tiện ích
                </label>
                <div className="flex flex-wrap gap-2">
                  {AMENITY_OPTIONS.map(a => (
                    <label
                      key={a.key}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs cursor-pointer transition-all border ${
                        form.amenities.includes(a.key)
                          ? isDark
                            ? 'border-indigo-400 text-indigo-300 bg-indigo-900/30'
                            : 'border-indigo-500 text-indigo-700 bg-indigo-50'
                          : isDark
                            ? 'border-gray-600 text-gray-300 bg-gray-700/60'
                            : 'border-gray-200 text-gray-600 bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={form.amenities.includes(a.key)}
                        onChange={() => toggleAmenity(a.key)}
                      />
                      {AMENITY_ICONS[a.key]?.icon}
                      {a.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Submit buttons */}
              <div className="flex gap-3 pt-2 pb-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(INITIAL_FORM); setFormErrors({}); setLocationError(null); }}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${
                    isDark
                      ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
                  style={{ background: gradient }}
                >
                  {isSubmitting ? 'Đang đăng...' : 'Đăng tin'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};
