import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, query, limit, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { RentalPost, RentalType } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'sonner';
import { Plus, X, Phone, MapPin, Wifi, Wind, Bath, Car, WashingMachine, Home, Search, Trash2, Building2, Users, Hotel, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { listenerRegistry } from '../utils/listenerRegistry';

interface RentalListProps {
  currentUser: User;
}

const RENTAL_TYPE_LABELS: Record<RentalType, string> = {
  'nha-tro':   '🏠 Nhà trọ',
  'o-ghep':    '👥 Ở ghép',
  'nha-nghi':  '🏨 Nhà nghỉ',
  'khach-san': '🏩 Khách sạn',
  'khac':      '📦 Khác',
};

const RENTAL_TYPE_ICONS: Record<string, React.ReactNode> = {
  'all':       <Home className="w-3.5 h-3.5" />,
  'nha-tro':   <Building2 className="w-3.5 h-3.5" />,
  'o-ghep':    <Users className="w-3.5 h-3.5" />,
  'nha-nghi':  <Hotel className="w-3.5 h-3.5" />,
  'khach-san': <Hotel className="w-3.5 h-3.5" />,
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
};

// Gradient chính của nền tảng TVU Connect
const GRADIENT_MAIN = 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)';
const GRADIENT_DARK = 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)';

export const RentalList: React.FC<RentalListProps> = ({ currentUser }) => {
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

  // Fetch rental posts realtime
  useEffect(() => {
    const q = query(
      collection(db, 'rentalPosts'),
      limit(30)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
        })) as RentalPost[];
        // Sort client-side by createdAt desc (tránh cần Firestore index)
        data.sort((a, b) => {
          const aTime = (a.createdAt as any)?.seconds ?? 0;
          const bTime = (b.createdAt as any)?.seconds ?? 0;
          return bTime - aTime;
        });
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
      query: 'limit(30)',
      priority: 5,
      componentName: 'RentalList',
    });

    return () => {
      listenerRegistry.unregister(listenerId);
    };
  }, []);

  const filteredPosts = posts.filter((p) => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    if (priceFilter === 'duoi-1-5' && p.price >= 1_500_000) return false;
    if (priceFilter === '1-5-den-2-5' && (p.price < 1_500_000 || p.price > 2_500_000)) return false;
    if (priceFilter === 'tren-2-5' && p.price <= 2_500_000) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.address.toLowerCase().includes(q);
    }
    return true;
  });

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
    if (!form.title.trim()) errors.title = 'Vui lòng nhập tiêu đề';
    if (!form.address.trim()) errors.address = 'Vui lòng nhập địa chỉ';
    if (!form.contactPhone.trim()) errors.contactPhone = 'Vui lòng nhập số điện thoại';
    if (!form.price.trim() || isNaN(Number(form.price)) || Number(form.price) <= 0)
      errors.price = 'Vui lòng nhập giá hợp lệ';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const postData = {
        title: form.title.trim(),
        type: form.type,
        price: Number(form.price),
        area: form.area ? Number(form.area) : null,
        address: form.address.trim(),
        description: form.description.trim(),
        contactName: form.contactName.trim() || currentUser.displayName || '',
        contactPhone: form.contactPhone.trim(),
        amenities: form.amenities,
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
                <p className={`text-[11px] sm:text-xs mt-0.5 ${textSecondary}`}>Phòng trọ quanh khu vực TVU</p>
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
                  { icon: '🔍', title: 'Tìm phòng', desc: 'Dùng thanh tìm kiếm hoặc bộ lọc loại phòng & giá' },
                  { icon: '📞', title: 'Liên hệ chủ trọ', desc: 'Nhấn vào tin để xem số điện thoại liên hệ' },
                  { icon: '✍️', title: 'Đăng tin cho thuê', desc: 'Nhấn nút + ở góc phải màn hình để đăng tin mới' },
                  { icon: '🗑️', title: 'Quản lý tin của bạn', desc: 'Nhấn biểu tượng thùng rác để xóa tin đã đăng' },
                ].map(({ icon, title, desc }) => (
                  <div
                    key={title}
                    className="flex items-start gap-2.5 px-3 py-2 rounded-xl"
                    style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)' }}
                  >
                    <span className="text-sm leading-none mt-0.5 flex-shrink-0">{icon}</span>
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
            {(['all', 'nha-tro', 'o-ghep', 'nha-nghi', 'khach-san'] as const).map(t => {
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
                  {t === 'all' ? 'Tất cả' : RENTAL_TYPE_LABELS[t as RentalType].replace(/^[^\s]+ /, '')}
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
        </div>
      </div>

      {/* ── Posts list ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20">

        {/* Loading skeleton */}
        {isLoading && (
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
        {!isLoading && filteredPosts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <Home className="w-8 h-8 text-indigo-500" />
            </div>
            <h3 className={`text-base font-bold mb-2 ${textPrimary}`}>
              {searchQuery || typeFilter !== 'all' || priceFilter !== 'all'
                ? 'Không tìm thấy tin phù hợp'
                : 'Chưa có tin trọ nào'}
            </h3>
            <p className={`text-sm ${textSecondary}`}>
              {searchQuery || typeFilter !== 'all' || priceFilter !== 'all'
                ? 'Thử thay đổi bộ lọc để tìm kết quả khác'
                : 'Hãy là người đầu tiên đăng tin tìm trọ!'}
            </p>
          </div>
        )}

        {/* Rental cards */}
        {!isLoading && filteredPosts.map(post => (
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
              </div>

              {/* Address */}
              <div className={`flex items-start gap-1.5 text-xs ${textSecondary}`}>
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-purple-400" />
                <span className="line-clamp-2">{post.address}</span>
              </div>

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

              {/* Contact button */}
              <a
                href={`tel:${post.contactPhone}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 mt-1"
                style={{ background: gradient }}
              >
                <Phone className="w-4 h-4" />
                Liên hệ{post.contactName ? ` · ${post.contactName}` : ''} · {post.contactPhone}
              </a>
            </div>
          </div>
        ))}
      </div>

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
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); } }}
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
                onClick={() => { setShowModal(false); setForm(INITIAL_FORM); setFormErrors({}); }}
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
                        {RENTAL_TYPE_LABELS[t].replace(/^[^\s]+ /, '')}
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
                  onClick={() => { setShowModal(false); setForm(INITIAL_FORM); setFormErrors({}); }}
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
