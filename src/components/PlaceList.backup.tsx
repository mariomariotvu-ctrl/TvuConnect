import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { Place, CheckIn, PlaceEvent, PlaceCategory } from '../types';
import { MapPin, Users, Star, Calendar, Filter, Search, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { db, deleteDoc, doc } from '../firebase';
import { toast } from 'sonner';
import { formatDistance, getCategoryLabel, type Coordinates } from '../utils/locationUtils';
import { logger } from '@/utils/logger';

interface PlaceListProps {
  places: (Place & { distance?: number })[];
  checkIns: CheckIn[];
  events: PlaceEvent[];
  currentUser: User;
  onPlaceSelect: (place: Place) => void;
  onCheckIn: (place: Place) => void;
  userLocation?: Coordinates | null;
  selectedCategory?: string;
  onCategoryChange?: (category: PlaceCategory | 'all') => void;
}

const CATEGORY_LABELS: { [key: string]: string } = {
  cafe: '☕ Quán nước',
  restaurant: '🍜 Quán ăn',
  vegetarian: '🥗 Quán chay',
  pharmacy: '💊 Nhà thuốc',
  flower: '💐 Tiệm hoa',
  printing: '🖨️ In ấn',
  clothing: '👔 Quần áo',
  shop: '🛒 Cửa hàng',
  bookstore: '📚 Nhà sách',
  study: '✏️ Chỗ học',
  sport: '⚽ Thể thao',
  entertainment: '🎮 Vui chơi'  // Added 10/4/2026
};

export const PlaceList: React.FC<PlaceListProps> = ({
  places,
  checkIns,
  events,
  currentUser,
  onPlaceSelect,
  onCheckIn,
  userLocation,
  selectedCategory: externalSelectedCategory,
  onCategoryChange
}) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory | 'all'>(
    (externalSelectedCategory as PlaceCategory | 'all') || 'all'
  );
  const [sortBy, setSortBy] = useState<'distance' | 'rating' | 'price' | 'popular'>('distance');
  const [selectedRadius, setSelectedRadius] = useState<number | 'all'>(5);
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [showScrollIndicator, setShowScrollIndicator] = useState({ left: false, right: false });
  const [isMobile, setIsMobile] = useState(false);
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false);
  
  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  // Sync with external category
  useEffect(() => {
    if (externalSelectedCategory) {
      setSelectedCategory(externalSelectedCategory as PlaceCategory | 'all');
    }
  }, [externalSelectedCategory]);

  // Notify parent of category changes
  useEffect(() => {
    if (onCategoryChange) {
      onCategoryChange(selectedCategory);
    }
  }, [selectedCategory, onCategoryChange]);

  // Reset scroll position when category changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, [selectedCategory]);

  // Collapsible header on scroll (mobile only) - OPTIMIZED
  useEffect(() => {
    if (!isMobile || !scrollContainerRef.current) return;

    let ticking = false;
    let lastKnownScrollY = 0;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!scrollContainerRef.current) return;
          
          const currentScrollY = scrollContainerRef.current.scrollTop;
          const scrollDiff = Math.abs(currentScrollY - lastKnownScrollY);
          
          // Chỉ update khi scroll đủ xa (>100px) để giảm re-renders
          if (scrollDiff > 100) {
            if (currentScrollY > lastKnownScrollY && currentScrollY > 50) {
              // Scrolling down
              setIsFilterCollapsed(true);
            } else if (currentScrollY < lastKnownScrollY) {
              // Scrolling up
              setIsFilterCollapsed(false);
            }
            lastKnownScrollY = currentScrollY;
          }
          
          ticking = false;
        });
        ticking = true;
      }
    };

    const scrollEl = scrollContainerRef.current;
    scrollEl.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollEl.removeEventListener('scroll', handleScroll);
    };
  }, [isMobile]);

  // Detect mobile with debounce
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    const debouncedCheckMobile = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkMobile, 150);
    };
    
    checkMobile();
    window.addEventListener('resize', debouncedCheckMobile);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', debouncedCheckMobile);
    };
  }, []);

  // Check scroll indicators with throttle for performance
  useEffect(() => {
    let rafId: number | null = null;
    let lastCheck = 0;
    
    const checkScroll = () => {
      if (categoryScrollRef.current) {
        const { scrollWidth, clientWidth, scrollLeft } = categoryScrollRef.current;
        const hasScroll = scrollWidth > clientWidth;
        const isAtStart = scrollLeft <= 10;
        const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 10;
        
        setShowScrollIndicator({
          left: hasScroll && !isAtStart,
          right: hasScroll && !isAtEnd
        });
      }
    };

    // Throttled scroll handler using requestAnimationFrame
    const throttledCheckScroll = () => {
      const now = Date.now();
      if (now - lastCheck >= 100) { // Max 10 checks per second
        lastCheck = now;
        checkScroll();
      }
      rafId = null;
    };

    const handleScroll = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(throttledCheckScroll);
      }
    };

    const handleResize = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(throttledCheckScroll);
      }
    };

    checkScroll();
    window.addEventListener('resize', handleResize, { passive: true });
    
    const scrollEl = categoryScrollRef.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', handleResize);
      if (scrollEl) {
        scrollEl.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // Scroll category functions
  const scrollCategoryRight = () => {
    if (categoryScrollRef.current) {
      categoryScrollRef.current.scrollBy({
        left: 200,
        behavior: 'smooth'
      });
    }
  };

  const scrollCategoryLeft = () => {
    if (categoryScrollRef.current) {
      categoryScrollRef.current.scrollBy({
        left: -200,
        behavior: 'smooth'
      });
    }
  };

  // Auto-scroll to selected category
  useEffect(() => {
    if (categoryScrollRef.current && selectedCategory !== 'all') {
      const selectedButton = categoryScrollRef.current.querySelector('.filter-category-btn.active');
      if (selectedButton) {
        selectedButton.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [selectedCategory]);

  // Helper function to safely get rating as number
  const getRating = (place: Place): number => {
    if (typeof place.rating === 'number') return place.rating;
    if (typeof place.rating === 'string') return parseFloat(place.rating) || 0;
    return 0;
  };

  // Helper function to normalize category
  const normalizeCategory = (place: Place): PlaceCategory => {
    const categoryMap: {[key: string]: PlaceCategory} = {
      'Quán cà phê': 'cafe',
      'Quán ăn': 'restaurant',
      'Quán chay': 'vegetarian',
      'Nhà thuốc': 'pharmacy',
      'Tiệm hoa': 'flower',
      'In ấn': 'printing',
      'Photocopy': 'printing',
      'Quần áo': 'clothing',
      'Tiệm quần áo': 'clothing',
      'May thuê': 'clothing',
      'May đo': 'clothing',
      'Cửa hàng': 'shop',
      'Quán mỳ cay': 'restaurant',
      'Quán mì cay': 'restaurant',
      'Thư viện': 'library',
      'Công viên': 'park',
      'Chỗ học': 'study',
      'Thể thao': 'sport',
      'Nhà sách': 'bookstore',
      'Tiệm sách': 'bookstore',
      'Cửa hàng văn phòng phẩm': 'bookstore',
      // Entertainment mapping
      'Khu vui chơi': 'entertainment',
      'Vui chơi': 'entertainment',
      'Game': 'entertainment',
      'Karaoke': 'entertainment',
      'Billiards': 'entertainment',
      'Bi-a': 'entertainment',
      // English keys
      'restaurant': 'restaurant',
      'cafe': 'cafe',
      'vegetarian': 'vegetarian',
      'pharmacy': 'pharmacy',
      'flower': 'flower',
      'printing': 'printing',
      'clothing': 'clothing',
      'shop': 'shop',
      'library': 'library',
      'park': 'park',
      'study': 'study',
      'sport': 'sport',
      'bookstore': 'bookstore',
      'entertainment': 'entertainment',
      'other': 'other'
    };
    
    // Get category - check both 'category' and 'loai' fields
    const categoryValue = place.category || (place as any).loai;
    return (categoryValue && categoryMap[categoryValue]) || 'other';
  };

  // Helper function to extract price value
  const getPriceValue = (place: Place): number => {
    if (!place.priceRange) return 999999; // Places without price go to end
    const match = place.priceRange.match(/(\d+)/);
    return match ? parseInt(match[1]) : 999999;
  };

  // Filter places by search and category
  const filteredBySearchAndCategory = places.filter(place => {
    const placeCategory = normalizeCategory(place);
    
    const matchesSearch = place.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         place.location?.address?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || placeCategory === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Filter by radius
  const filteredByRadius = filteredBySearchAndCategory.filter(place => {
    if (selectedRadius === 'all') return true;
    return place.distance !== undefined && place.distance <= selectedRadius;
  });

  // Apply nearby toggle
  const nearbyFilteredPlaces = showNearbyOnly ? filteredByRadius : filteredBySearchAndCategory;

  // Sort places
  const sortedPlaces = [...nearbyFilteredPlaces].sort((a, b) => {
    switch (sortBy) {
      case 'distance':
        return (a.distance || 999) - (b.distance || 999);
      case 'rating':
        return getRating(b) - getRating(a);
      case 'price':
        return getPriceValue(a) - getPriceValue(b);
      case 'popular':
        return (b.checkInCount || 0) - (a.checkInCount || 0);
      default:
        return 0;
    }
  });

  // Debug logging
  logger.log('🔍 PlaceList Debug:', {
    totalPlaces: places.length,
    afterSearchAndCategory: filteredBySearchAndCategory.length,
    afterRadius: filteredByRadius.length,
    afterNearbyToggle: nearbyFilteredPlaces.length,
    finalSorted: sortedPlaces.length,
    selectedRadius,
    showNearbyOnly,
    sortBy,
    userLocation
  });

  const getPlaceVisitors = (placeId: string): CheckIn[] => {
    return checkIns.filter(c => c.placeId === placeId && c.visibility === 'public');
  };

  const getPlaceEvents = (placeId: string): PlaceEvent[] => {
    return events.filter(e => e.placeId === placeId);
  };

  // Check if current user has checked in at this place
  const getUserCheckIn = (placeId: string): CheckIn | undefined => {
    return checkIns.find(c => c.placeId === placeId && c.userId === currentUser.uid);
  };

  // Delete check-in
  const handleDeleteCheckIn = async (checkInId: string, placeName: string) => {
    try {
      await deleteDoc(doc(db, 'checkIns', checkInId));
      toast.success(`Đã xóa check-in tại ${placeName}`);
    } catch (error) {
      console.error('Error deleting check-in:', error);
      toast.error('Không thể xóa check-in. Vui lòng thử lại.');
    }
  };

  // Toggle description expansion
  const toggleDescription = (placeId: string) => {
    const newExpanded = new Set(expandedDescriptions);
    if (newExpanded.has(placeId)) {
      newExpanded.delete(placeId);
    } else {
      newExpanded.add(placeId);
    }
    setExpandedDescriptions(newExpanded);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sticky Compact Header */}
      <div 
        className={`sticky top-0 z-50 transition-all duration-300 ${
          isMobile && isFilterCollapsed ? 'py-2' : 'py-3'
        }`}
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Search */}
        <div className={`relative ${isMobile ? 'mb-2' : 'mb-3'}`}>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm địa điểm..."
            className={`w-full pl-10 pr-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              isMobile ? 'py-2.5 text-sm' : 'py-3'
            }`}
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
              borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
              color: theme === 'dark' ? '#ffffff' : '#000000'
            }}
          />
        </div>

        {/* Radius Filter */}
        <div 
          className={`rounded-xl border ${isMobile ? 'p-2 mb-2' : 'p-3 mb-3'}`}
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : 'transparent',
            borderColor: theme === 'dark' ? '#4B5563' : '#e5e7eb'
          }}
        >
          <p 
            className={`font-semibold mb-2 ${isMobile ? 'text-xs' : 'text-sm'}`}
            style={{ color: theme === 'dark' ? '#D1D5DB' : '#374151' }}
          >
            Bán kính:
          </p>
          <div className={`flex ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
            {([1, 3, 5, 10, 'all'] as const).map(radius => (
              <button
                key={radius}
                onClick={() => setSelectedRadius(radius)}
                className={`${isMobile ? 'flex-1 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-full font-bold whitespace-nowrap transition-all duration-200 ${
                  selectedRadius === radius
                    ? 'text-white shadow-lg scale-105'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105'
                }`}
                style={
                  selectedRadius === radius
                    ? {
                        background: theme === 'dark'
                          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.9) 0%, rgba(6, 182, 212, 0.9) 100%)'
                          : 'linear-gradient(135deg, rgba(147, 51, 234, 0.9) 0%, rgba(14, 165, 233, 0.9) 100%)',
                        border: theme === 'dark'
                          ? '1px solid rgba(139, 92, 246, 0.2)'
                          : '1px solid rgba(147, 51, 234, 0.2)',
                        boxShadow: theme === 'dark'
                          ? '0 2px 8px rgba(139, 92, 246, 0.3)'
                          : '0 2px 8px rgba(147, 51, 234, 0.3)'
                      }
                    : {}
                }
              >
                {radius === 'all' ? 'Tất cả' : `${radius}km`}
              </button>
            ))}
          </div>
        </div>

        {/* Nearby Toggle */}
        {userLocation && (
          <label 
            className={`flex items-center ${isMobile ? 'gap-2 p-2 mb-2' : 'gap-3 p-3 mb-3'} rounded-xl border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`}
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : 'transparent',
              borderColor: theme === 'dark' ? '#4B5563' : '#e5e7eb'
            }}
          >
            <div className="relative inline-block">
              <input
                type="checkbox"
                checked={showNearbyOnly}
                onChange={(e) => setShowNearbyOnly(e.target.checked)}
                className="sr-only peer"
              />
              <div 
                className={`w-11 h-6 rounded-full transition-all duration-300 ${
                  showNearbyOnly 
                    ? 'shadow-lg' 
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
                style={
                  showNearbyOnly
                    ? {
                        background: theme === 'dark'
                          ? 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)'
                          : 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)'
                      }
                    : {}
                }
              >
                <div 
                  className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-300 ${
                    showNearbyOnly ? 'translate-x-5' : ''
                  }`}
                  style={{
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                  }}
                />
              </div>
            </div>
            <div className="flex-1">
              <span 
                className={`font-semibold ${isMobile ? 'text-sm' : 'text-base'}`}
                style={{ color: theme === 'dark' ? '#E5E7EB' : '#1F2937' }}
              >
                {isMobile ? 'Chỉ gần tôi' : 'Chỉ hiện địa điểm gần tôi'}
              </span>
              {!isMobile && (
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">
                  (trong {selectedRadius === 'all' ? 'tất cả' : `${selectedRadius}km`})
                </span>
              )}
              {isMobile && (
                <span className="text-xs text-gray-500 dark:text-gray-400 block">
                  ({selectedRadius === 'all' ? 'tất cả' : `${selectedRadius}km`})
                </span>
              )}
            </div>
          </label>
        )}

        {/* Category Filter - Premium UX with dual indicators */}
        <div 
          className={`category-filter-container relative rounded-xl ${
            isMobile ? 'p-2' : 'p-3'
          }`}
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : 'transparent',
            border: theme === 'dark' ? '1px solid #4B5563' : 'none'
          }}
        >
          {/* Left Scroll Indicator - Desktop: Outside container */}
          {showScrollIndicator.left && !isMobile && (
            <button
              onClick={scrollCategoryLeft}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg hover:bg-indigo-700 hover:scale-110 transition-all duration-200"
              aria-label="Cuộn trái"
              style={{
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06)'
              }}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Mobile Left Fade - No button, just gradient */}
          {showScrollIndicator.left && isMobile && (
            <div 
              className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-10"
              style={{
                background: theme === 'dark' 
                  ? 'linear-gradient(to right, rgba(55, 65, 81, 0.8) 0%, transparent 100%)'
                  : 'linear-gradient(to right, rgba(255, 255, 255, 0.8) 0%, transparent 100%)'
              }}
            />
          )}

          {/* Category Pills Container */}
          <div 
            ref={categoryScrollRef}
            className="flex gap-2 overflow-x-auto pb-2 scroll-smooth px-1 snap-x snap-mandatory"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              scrollPaddingInline: '70px' // Tăng padding để tránh bị che
            }}
          >
            <button
              onClick={() => setSelectedCategory('all')}
              className={`filter-category-btn flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-200 snap-start ${
                selectedCategory === 'all'
                  ? `active bg-indigo-600 text-white shadow-lg scale-105 ${
                      theme === 'dark' 
                        ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-800' 
                        : 'ring-2 ring-indigo-300 ring-offset-1 ring-offset-white'
                    }`
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105 hover:shadow-md'
              }`}
            >
              Tất cả
            </button>
            {(Object.keys(CATEGORY_LABELS) as string[]).map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category as PlaceCategory)}
                className={`filter-category-btn flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-200 snap-start ${
                  selectedCategory === category
                    ? `active bg-indigo-600 text-white shadow-lg scale-105 ${
                        theme === 'dark' 
                          ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-800' 
                          : 'ring-2 ring-indigo-300 ring-offset-1 ring-offset-white'
                      }`
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105 hover:shadow-md'
                }`}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>

          {/* Right Scroll Indicator - Desktop: Outside container */}
          {showScrollIndicator.right && !isMobile && (
            <button
              onClick={scrollCategoryRight}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg hover:bg-indigo-700 hover:scale-110 transition-all duration-200 animate-pulse hover:animate-none"
              aria-label="Cuộn phải"
              style={{
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06)'
              }}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Mobile Right Fade - No button, just gradient + hint */}
          {showScrollIndicator.right && isMobile && (
            <div 
              className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none z-10"
              style={{
                background: theme === 'dark' 
                  ? 'linear-gradient(to left, rgba(55, 65, 81, 0.8) 0%, transparent 100%)'
                  : 'linear-gradient(to left, rgba(255, 255, 255, 0.8) 0%, transparent 100%)'
              }}
            />
          )}

          {/* Mobile hint text - Enhanced for Light Mode */}
          {isMobile && showScrollIndicator.right && (
            <div className="text-center mt-2 px-2">
              <p 
                className="text-xs font-semibold animate-pulse inline-flex items-center gap-1 px-3 py-1.5 rounded-full border shadow-sm"
                style={{
                  color: theme === 'dark' ? '#A5B4FC' : '#4F46E5',
                  backgroundColor: theme === 'dark' ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF',
                  borderColor: theme === 'dark' ? '#6366F1' : '#C7D2FE'
                }}
              >
                <span className="text-sm">👉</span>
                <span>Vuốt sang để xem thêm</span>
              </p>
            </div>
          )}
        </div>

        {/* Sort Options */}
        <div 
          className={`rounded-xl border ${isMobile ? 'p-2 mb-2' : 'p-3 mb-3'}`}
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : 'transparent',
            borderColor: theme === 'dark' ? '#4B5563' : '#e5e7eb'
          }}
        >
          <p 
            className={`font-semibold mb-2 ${isMobile ? 'text-xs' : 'text-sm'}`}
            style={{ color: theme === 'dark' ? '#D1D5DB' : '#374151' }}
          >
            Sắp xếp:
          </p>
          <div className={`${isMobile ? 'grid grid-cols-2 gap-1.5' : 'flex gap-2'}`}>
            {[
              { value: 'distance' as const, label: 'Gần nhất' },
              { value: 'rating' as const, label: isMobile ? 'Đánh giá' : 'Đánh giá cao' },
              { value: 'price' as const, label: isMobile ? 'Giá' : 'Giá rẻ' },
              { value: 'popular' as const, label: 'Phổ biến' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value)}
                className={`${isMobile ? 'py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-full font-bold whitespace-nowrap transition-all duration-200 ${
                  sortBy === option.value
                    ? 'text-white shadow-lg scale-105'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105'
                }`}
                style={
                  sortBy === option.value
                    ? {
                        background: theme === 'dark'
                          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.9) 0%, rgba(6, 182, 212, 0.9) 100%)'
                          : 'linear-gradient(135deg, rgba(147, 51, 234, 0.9) 0%, rgba(14, 165, 233, 0.9) 100%)',
                        border: theme === 'dark'
                          ? '1px solid rgba(139, 92, 246, 0.2)'
                          : '1px solid rgba(147, 51, 234, 0.2)',
                        boxShadow: theme === 'dark'
                          ? '0 2px 8px rgba(139, 92, 246, 0.3)'
                          : '0 2px 8px rgba(147, 51, 234, 0.3)'
                      }
                    : {}
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Toggle Button */}
        {isMobile && (
          <button
            onClick={() => setIsFilterCollapsed(!isFilterCollapsed)}
            className="w-full mt-2 py-1.5 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg transition-colors"
            style={{
              color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
              backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.3)' : '#F3F4F6'
            }}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{isFilterCollapsed ? 'Hiện bộ lọc' : 'Ẩn bộ lọc'}</span>
            <span className={`transform transition-transform ${isFilterCollapsed ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
        )}
      </div>

      {/* Compact Filter Status Bar (when collapsed on mobile) */}
      {isMobile && isFilterCollapsed && (
        <div 
          className="px-3 py-2 border-b flex items-center justify-between"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.4)' : '#F9FAFB',
            borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
          }}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold" style={{ color: theme === 'dark' ? '#D1D5DB' : '#374151' }}>
              {selectedCategory === 'all' ? 'Tất cả' : CATEGORY_LABELS[selectedCategory]}
            </span>
            {searchQuery && (
              <span className="text-gray-500">• "{searchQuery}"</span>
            )}
          </div>
          <button
            onClick={() => setIsFilterCollapsed(false)}
            className="text-indigo-600 dark:text-indigo-400 font-semibold text-xs"
          >
            Sửa
          </button>
        </div>
      )}

      {/* Results Counter */}
      {!isFilterCollapsed && (
        <div 
          className={`border-b ${isMobile ? 'px-3 py-2' : 'px-4 py-3'}`}
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.4)' : '#F9FAFB',
            borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
          }}
        >
          {isMobile ? (
            <div className="text-center">
              <span 
                className="text-sm font-bold"
                style={{ color: theme === 'dark' ? '#E5E7EB' : '#1F2937' }}
              >
                📊 {sortedPlaces.length} {selectedCategory === 'all' ? 'địa điểm' : getCategoryLabel(selectedCategory)}
                {selectedRadius !== 'all' && ` trong ${selectedRadius}km`}
              </span>
              {sortedPlaces.length > 0 && (
                <div className="mt-1 flex items-center justify-center gap-1 text-xs text-gray-500 animate-bounce">
                  <span>👇</span>
                  <span>Xem danh sách bên dưới</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <span 
                  className="font-bold"
                  style={{ color: theme === 'dark' ? '#E5E7EB' : '#1F2937' }}
                >
                  Tìm thấy {sortedPlaces.length} {selectedCategory === 'all' ? 'địa điểm' : getCategoryLabel(selectedCategory)}
                  {selectedRadius !== 'all' && ` trong ${selectedRadius}km`}
                </span>
                {sortedPlaces.length > 0 && (
                  <span className="text-sm text-gray-500 ml-2 animate-pulse">
                    👇 Xem danh sách bên dưới
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  // Scroll to top and switch to map tab
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  // Trigger parent to switch tab if callback exists
                }}
                className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                style={{
                  color: theme === 'dark' ? '#A78BFA' : '#7C3AED',
                  backgroundColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(124, 58, 237, 0.1)'
                }}
              >
                Xem trên bản đồ
              </button>
            </div>
          )}
        </div>
      )}

      {/* Places List */}
      <div 
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto space-y-4 ${isMobile ? 'p-3' : 'p-4'}`}
        style={{
          minHeight: '200px', // Đảm bảo luôn có chiều cao tối thiểu
          maxHeight: 'calc(100vh - 400px)' // Giới hạn chiều cao để có scroll
        }}
      >
        {sortedPlaces.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Không tìm thấy địa điểm nào</p>
          </div>
        ) : (
          sortedPlaces.map(place => {
            const visitors = getPlaceVisitors(place.id!);
            const placeEvents = getPlaceEvents(place.id!);
            const normalizedCategory = normalizeCategory(place);
            const userCheckIn = getUserCheckIn(place.id!);

            return (
              <div
                key={place.id}
                className="rounded-2xl p-4 border cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl relative"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' : '#ffffff',
                  borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                  boxShadow: theme === 'dark' 
                    ? '0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -1px rgb(0 0 0 / 0.2)'
                    : '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06)'
                }}
                onClick={() => onPlaceSelect(place)}
              >
                {/* Distance Badge - Top Right */}
                {place.distance !== undefined && (
                  <div 
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-full backdrop-blur-md shadow-lg"
                    style={{
                      background: theme === 'dark' 
                        ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.9) 0%, rgba(6, 182, 212, 0.9) 100%)' 
                        : 'linear-gradient(135deg, rgba(147, 51, 234, 0.9) 0%, rgba(14, 165, 233, 0.9) 100%)',
                      border: theme === 'dark' 
                        ? '1px solid rgba(196, 181, 253, 0.4)' 
                        : '1px solid rgba(224, 231, 255, 0.5)',
                      boxShadow: theme === 'dark'
                        ? '0 4px 12px rgba(139, 92, 246, 0.3)'
                        : '0 4px 12px rgba(147, 51, 234, 0.3)'
                    }}
                  >
                    <span className="text-white text-sm font-bold drop-shadow-md">
                      📍 {formatDistance(place.distance)}
                    </span>
                  </div>
                )}

                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 pr-20">
                    <h3 
                      className="font-bold text-lg mb-1"
                      style={{ color: theme === 'dark' ? '#ffffff' : '#1F2937' }}
                    >
                      {place.name || 'Bếp Chay Nhà Ruma'}
                    </h3>
                    <p 
                      className="text-sm flex items-center gap-1 font-semibold"
                      style={{ 
                        color: theme === 'dark' ? '#D1D5DB' : '#374151',
                        fontWeight: 600
                      }}
                    >
                      <MapPin className="w-4 h-4" />
                      {place.location?.address || 'Chưa có địa chỉ'}
                    </p>
                    {/* Distance Text */}
                    {place.distance !== undefined && (
                      <p 
                        className="text-sm font-semibold mt-1"
                        style={{
                          background: theme === 'dark'
                            ? 'linear-gradient(135deg, #A78BFA 0%, #22D3EE 100%)'
                            : 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}
                      >
                        🚶 Cách bạn {formatDistance(place.distance)}
                      </p>
                    )}
                  </div>
                  <span className="text-2xl">{CATEGORY_LABELS[normalizedCategory]?.split(' ')[0] || '📍'}</span>
                </div>

                {/* Stats - Redesigned */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {/* Rating Badge */}
                  <div className="place-badge place-badge-rating flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
                      {getRating(place).toFixed(1)}
                    </span>
                  </div>

                  {/* Opening Hours Badge */}
                  {(place.openHours || (place as any).opening_hours) && (
                    <div className="place-badge place-badge-hours flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                      <span className="text-lg leading-none flex items-center" style={{ marginTop: '1px' }}>🕐</span>
                      <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        {place.openHours || (place as any).opening_hours}
                      </span>
                    </div>
                  )}

                  {/* Price Range Badge */}
                  {(place.priceRange || (place as any).price_range) && (
                    <div className="place-badge place-badge-price flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <span className="text-base leading-none flex items-center" style={{ marginTop: '2px' }}>💰</span>
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-400">
                        {place.priceRange || (place as any).price_range}
                      </span>
                    </div>
                  )}

                  {/* Events Badge */}
                  {placeEvents.length > 0 && (
                    <div className="place-badge place-badge-events flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                      <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-sm font-bold text-purple-700 dark:text-purple-400">
                        {placeEvents.length} sự kiện
                      </span>
                    </div>
                  )}
                </div>

                {/* Description */}
                {place.description && (
                  <div className="mb-3">
                    <p 
                      className={`text-sm md:block ${expandedDescriptions.has(place.id!) ? '' : 'line-clamp-2 md:line-clamp-none'}`}
                      style={{ 
                        color: theme === 'dark' ? '#E5E7EB' : '#1F2937',
                        lineHeight: '1.6',
                        fontWeight: 600
                      }}
                    >
                      {place.description}
                    </p>
                    {place.description.length > 100 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDescription(place.id!);
                        }}
                        className="md:hidden text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline mt-1"
                      >
                        {expandedDescriptions.has(place.id!) ? 'Thu gọn' : 'Xem thêm'}
                      </button>
                    )}
                  </div>
                )}

                {/* Visitors Preview */}
                {visitors.length > 0 && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">
                      Đang ở đây:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {visitors.slice(0, 5).map(visitor => (
                        <span 
                          key={visitor.id}
                          className="text-xs bg-white dark:bg-gray-700 px-2 py-1 rounded-full"
                        >
                          {visitor.userName}
                          {visitor.statusText && ` • ${visitor.statusText}`}
                        </span>
                      ))}
                      {visitors.length > 5 && (
                        <span className="text-xs text-gray-500">
                          +{visitors.length - 5} người khác
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {userCheckIn ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCheckIn(userCheckIn.id!, place.name);
                      }}
                      className="flex-1 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Xóa check-in
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCheckIn(place);
                      }}
                      className="flex-1 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700"
                    >
                      Check-in
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (place.location?.lat && place.location?.lng) {
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.location.lat},${place.location.lng}`, '_blank');
                      }
                    }}
                    disabled={!place.location?.lat || !place.location?.lng}
                    className={`px-4 py-2 text-sm font-bold rounded-lg ${
                      place.location?.lat && place.location?.lng
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Chỉ đường
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
