import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, query, limit, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { RentalPost, RentalType } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'sonner';
import { Plus, X, Phone, MapPin, Wifi, Wind, Bath, Car, WashingMachine, Home, Search, Trash2, Building2, Users, Hotel, ChevronDown, ChevronUp, Info, LocateFixed, Copy, Star } from 'lucide-react';
import { listenerRegistry } from '../utils/listenerRegistry';
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
  const [posts, setPosts] = useState<RentalPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<RentalType | 'all'>('all');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [showModal, setShowModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [form, setForm] = useState<PostFormState>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<PostFormState>>({});
  const [locationError, setLocationError] = useState<string | null>(null);
  const [radius, setRadius] = useState<'all' | 1 | 3 | 5 | 10>('all');
  const [selectedPost, setSelectedPost] = useState<(RentalPost & { distance?: number }) | null>(null);
  const [nearbyPosts, setNearbyPosts] = useState<RentalPost[] | null>(null);
  const [isNearbyLoading, setIsNearbyLoading] = useState(false);

  // Fetch rental posts realtime
  useEffect(() => {
    const q = query(
      collection(db, 'rentalPosts'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
        })) as RentalPost[];
        setPosts(data);
        setIsLoading(false);
      },
      (err) => {
        console.error('Error loading rentalPosts:', err);
        setIsLoading(false);
        toast.error('Không thể tải danh sách tin trọ');
      }
    );

    const listenerId = listenerRegistry.register({
      unsubscribe,
      collection: 'rentalPosts',
      query: 'orderBy(createdAt, desc), limit(100)',
      priority: 5,
      componentName: 'RentalList',
    });

    return () => {
      listenerRegistry.unregister(listenerId);
    };
  }, []);

  useEffect(() => {
    if (!userLocation || radius === 'all') {
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
    if (!userLocation || radius === 'all') return posts;

    // Keep recent legacy listings visible until the one-time geohash migration
    // has populated their index field.
    const merged = new Map<string, RentalPost>();
    (nearbyPosts || []).forEach((post) => post.id && merged.set(post.id, post));
    posts
      .filter((post) => !post.geohash && post.location)
      .filter((post) => calculateDistance(userLocation, post.location!) <= radius)
      .forEach((post) => post.id && merged.set(post.id, post));
    return [...merged.values()];
  }, [nearbyPosts, posts, radius, userLocation]);

  const filteredPosts = useMemo(() => sourcePosts
    .map((post) => ({
      ...post,
      distance: userLocation && post.location
        ? calculateDistance(userLocation, post.location)
        : undefined,
    }))
    .filter((post) => {
      if (post.isAvailable === false) return false;
      if (typeFilter !== 'all' && post.type !== typeFilter) return false;
      if (priceFilter === 'duoi-1-5' && post.price >= 1_500_000) return false;
      if (priceFilter === '1-5-den-2-5' && (post.price < 1_500_000 || post.price > 2_500_000)) return false;
      if (priceFilter === 'tren-2-5' && post.price <= 2_500_000) return false;
      if (radius !== 'all' && (post.distance === undefined || post.distance > radius)) return false;
      if (searchQuery.trim()) {
        const keyword = searchQuery.toLocaleLowerCase('vi');
        return [post.title, post.address, post.district, post.description, post.utilitiesNote, post.genderPreference]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('vi').includes(keyword));
      }
      return true;
    })
    .sort((a, b) => {
      if (!userLocation) return 0;
      return (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY);
    }), [priceFilter, radius, searchQuery, sourcePosts, typeFilter, userLocation]);

  const listLoading = isLoading || (radius !== 'all' && Boolean(userLocation) && isNearbyLoading);

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
    if (coordinates && !forListing && radius === 'all') setRadius(5);
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">

      {/* ── Hero Banner + Filters ── */}
      <div className="flex-shrink-0">
        {/* Hero */}
        <div
          className="px-3 sm:px-4 pt-3 pb-3"
          style={{ background: isDark
            ? 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(6,182,212,0.12) 100%)'
            : 'linear-gradient(135deg, rgba(147,51,234,0.07) 0%, rgba(14,165,233,0.07) 100%)' }}
        >
          <div className="flex items-center justify-between gap-2">
            {/* Left: icon + title + subtitle */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)' }}
              >
                <Home className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className={`text-sm sm:text-base font-black tracking-tight leading-tight ${textPrimary}`}>Tìm Trọ</h1>
                <p className={`text-[11px] sm:text-xs mt-0.5 ${textSecondary}`}>Trọ quanh bạn tại Trà Vinh · có review sinh viên</p>
              </div>
            </div>

            {/* Right: guide toggle + count */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setShowGuide(v => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                  showGuide
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                    : `${isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-black/5 text-gray-500 hover:bg-black/10'}`
                }`}
              >
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Hướng dẫn</span>
                {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <div
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl"
                style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
              >
                <span className={`text-sm font-black ${textPrimary}`}>{filteredPosts.length}</span>
                <span className={`text-[11px] font-medium ${textSecondary}`}>tin</span>
              </div>
            </div>
          </div>

          {/* Guide panel — collapsible, 1 col mobile / 2 col desktop */}
          {showGuide && (
            <div
              className="mt-2 rounded-2xl overflow-hidden"
              style={{
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.75)',
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {[
                  { icon: <LocateFixed className="h-4 w-4" />, title: 'Tìm quanh đây', desc: 'Cấp vị trí và lọc phòng trong bán kính 1–10 km' },
                  { icon: <Star className="h-4 w-4" />, title: 'Review thật', desc: 'Xem và viết đánh giá ngay trong TVU Connect' },
                  { icon: <Plus className="h-4 w-4" />, title: 'Đăng tin cho thuê', desc: 'Nhấn nút + ở góc phải màn hình để đăng tin mới' },
                  { icon: <Trash2 className="h-4 w-4" />, title: 'Quản lý tin của bạn', desc: 'Nhấn biểu tượng thùng rác để xóa tin đã đăng' },
                ].map(({ icon, title, desc }) => (
                  <div
                    key={title}
                    className="flex items-start gap-2.5 px-3 py-2 rounded-xl"
                    style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)' }}
                  >
                    <span className="mt-0.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true">{icon}</span>
                    <div>
                      <p className={`text-xs font-bold leading-tight ${textPrimary}`}>{title}</p>
                      <p className={`text-[11px] leading-tight mt-0.5 ${textSecondary}`}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm theo tiêu đề, địa chỉ..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`${inputClass} pl-9 pr-8`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter chips */}
        <div
          className="px-3 sm:px-4 py-2 space-y-1.5"
          style={{
            backgroundColor: isDark ? 'rgba(17,24,39,0.95)' : '#f8f7ff',
            borderBottom: `1px solid ${isDark ? '#374151' : '#e9e8ff'}`,
          }}
        >
          {/* Type chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {(['all', 'nha-tro', 'o-ghep', 'nha-nghi', 'khach-san', 'khac'] as const).map(t => {
              const isActive = typeFilter === t;
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    isActive
                      ? 'text-white shadow-md'
                      : isDark
                        ? 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                        : 'bg-white text-gray-600 hover:bg-indigo-50 border border-gray-200'
                  }`}
                  style={isActive ? { background: gradient } : {}}
                >
                  {RENTAL_TYPE_ICONS[t]}
                  {t === 'all' ? 'Tất cả' : RENTAL_TYPE_LABELS[t as RentalType]}
                </button>
              );
            })}
          </div>

          {/* Price chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {([
              { key: 'all',         label: 'Mọi giá' },
              { key: 'duoi-1-5',    label: '< 1.5tr' },
              { key: '1-5-den-2-5', label: '1.5–2.5tr' },
              { key: 'tren-2-5',    label: '> 2.5tr' },
            ] as const).map(p => {
              const isActive = priceFilter === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setPriceFilter(p.key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md'
                      : isDark
                        ? 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
                        : 'bg-white text-gray-600 hover:bg-indigo-50 border border-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Nearby location controls */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              disabled={locating}
              onClick={() => void updateCurrentLocation(false)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-600 text-white inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <LocateFixed className={`w-3.5 h-3.5 ${locating ? 'animate-pulse' : ''}`} />
              {userLocation ? 'Cập nhật vị trí' : 'Tìm trọ quanh tôi'}
            </button>
            {(['all', 1, 3, 5, 10] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={value !== 'all' && !userLocation}
                onClick={() => setRadius(value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold disabled:opacity-40 ${radius === value ? 'bg-indigo-600 text-white' : isDark ? 'bg-gray-700 text-gray-300' : 'bg-white border border-gray-200 text-gray-600'}`}
              >
                {value === 'all' ? 'Mọi khoảng cách' : `≤ ${value} km`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Posts list ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20">

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
              {searchQuery || typeFilter !== 'all' || priceFilter !== 'all' || radius !== 'all'
                ? 'Không tìm thấy tin phù hợp'
                : 'Chưa có tin trọ nào'}
            </h3>
            <p className={`text-sm ${textSecondary}`}>
              {searchQuery || typeFilter !== 'all' || priceFilter !== 'all' || radius !== 'all'
                ? 'Thử thay đổi bộ lọc để tìm kết quả khác'
                : 'Hãy là người đầu tiên đăng tin tìm trọ!'}
            </p>
          </div>
        )}

        {/* Rental cards */}
        {!listLoading && filteredPosts.map(post => (
          <div
            key={post.id}
            className={`${cardBg} border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow`}
          >
            {/* Card header with gradient background */}
            <div
              className="px-4 pt-3.5 pb-3 relative"
              style={{
                background: isDark
                  ? 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(6,182,212,0.1) 100%)'
                  : 'linear-gradient(135deg, rgba(147,51,234,0.06) 0%, rgba(14,165,233,0.06) 100%)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold text-sm leading-snug mb-1.5 ${textPrimary}`}>
                    {post.title}
                  </h3>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      background: isDark ? 'rgba(139,92,246,0.2)' : 'rgba(99,102,241,0.1)',
                      color: isDark ? '#a78bfa' : '#4f46e5',
                    }}
                  >
                    {RENTAL_TYPE_LABELS[post.type]}
                  </span>
                </div>
                {post.createdBy === currentUser.uid && (
                  <button
                    onClick={() => handleDelete(post.id!)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Xóa tin"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Card body */}
            <div className="px-4 pb-4 pt-2 space-y-2.5">
              {/* Price & area */}
              <div className="flex items-center gap-3">
                <span
                  className="font-extrabold text-lg"
                  style={{
                    background: gradient,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {formatPrice(post.price)}
                </span>
                {post.area && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                    {post.area} m²
                  </span>
                )}
                {post.distance !== undefined && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                    <LocateFixed className="w-3 h-3 inline mr-1" />{formatDistance(post.distance)}
                  </span>
                )}
              </div>

              {/* Address */}
              <div className={`flex items-start gap-1.5 text-xs ${textSecondary}`}>
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-purple-400" />
                <span className="line-clamp-2">{post.address}</span>
              </div>

              {post.description && (
                <p className={`text-xs leading-relaxed line-clamp-3 ${textSecondary}`}>{post.description}</p>
              )}

              {(post.deposit || post.electricityPrice || post.waterPrice || post.availableFrom || post.genderPreference && post.genderPreference !== 'any') && (
                <div className={`rounded-xl p-2.5 text-xs grid grid-cols-1 sm:grid-cols-2 gap-1.5 ${isDark ? 'bg-gray-700/50 text-gray-300' : 'bg-slate-50 text-slate-600'}`}>
                  {post.deposit ? <span>Tiền cọc: <strong>{formatVnd(post.deposit)}</strong></span> : null}
                  {post.electricityPrice ? <span>Điện: <strong>{formatVnd(post.electricityPrice)}/kWh</strong></span> : null}
                  {post.waterPrice ? <span>Nước: <strong>{formatVnd(post.waterPrice)}</strong></span> : null}
                  {post.availableFrom ? <span>Nhận phòng: <strong>{new Date(`${post.availableFrom}T00:00:00`).toLocaleDateString('vi-VN')}</strong></span> : null}
                  {post.genderPreference && post.genderPreference !== 'any' ? <span>Phù hợp: <strong>{post.genderPreference === 'male' ? 'Nam' : 'Nữ'}</strong></span> : null}
                </div>
              )}

              {post.utilitiesNote && (
                <p className={`text-xs leading-relaxed ${textSecondary}`}><Info className="w-3.5 h-3.5 inline mr-1 text-indigo-400" />{post.utilitiesNote}</p>
              )}

              {/* Amenities */}
              {post.amenities?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {post.amenities.map(a =>
                    AMENITY_ICONS[a] ? (
                      <span
                        key={a}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background: isDark ? 'rgba(139,92,246,0.12)' : 'rgba(99,102,241,0.08)',
                          color: isDark ? '#a78bfa' : '#4f46e5',
                        }}
                      >
                        {AMENITY_ICONS[a].icon}
                        {AMENITY_ICONS[a].label}
                      </span>
                    ) : null
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setSelectedPost(post)}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: gradient }}
                >
                  <Star className="w-4 h-4" /> Chi tiết, bản đồ & review
                </button>
                <button
                  type="button"
                  onClick={() => void copyPhone(post.contactPhone)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border ${isDark ? 'border-gray-600 text-gray-200' : 'border-gray-200 text-gray-700'}`}
                >
                  <Copy className="w-4 h-4" /> Sao chép SĐT
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

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
        className="absolute bottom-5 right-5 flex items-center gap-2 px-4 py-3 rounded-full text-white font-semibold shadow-lg transition-all hover:opacity-90 active:scale-95 z-10"
        style={{ background: gradient, boxShadow: '0 4px 20px rgba(147,51,234,0.4)' }}
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
