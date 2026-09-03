import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { Place, CheckIn, PlaceEvent, PlaceCategory } from '../types';
import { MapPin, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { db, deleteDoc, doc } from '../firebase';
import { toast } from 'sonner';
import { type Coordinates } from '../utils/locationUtils';
import { PlaceCard } from './PlaceCard';

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
  resetScrollKey?: number; // Add key to trigger scroll reset
  onProfileClick?: (uid: string) => void;
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
  onCategoryChange,
  resetScrollKey,
  onProfileClick
}) => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(''); // Debounced search
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory | 'all'>(
    (externalSelectedCategory as PlaceCategory | 'all') || 'all'
  );
  const [sortBy, setSortBy] = useState<'distance' | 'rating' | 'price' | 'popular'>('distance');
  const [selectedRadius, setSelectedRadius] = useState<number | 'all'>('all');
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [showScrollButtons, setShowScrollButtons] = useState({ left: false, right: false });
  const [showMobileScrollHint, setShowMobileScrollHint] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(20); // Start with 20 items for mobile performance
  
  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreObserverRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const searchDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search query - wait 200ms after user stops typing (faster response)
  useEffect(() => {
    // Clear previous timer
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }

    // Set new timer
    searchDebounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200); // 200ms debounce - faster than 300ms

    // Cleanup
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  // Memoize card styles to prevent re-creating on every render
  const cardStyles = React.useMemo(() => ({
    backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' : '#ffffff',
    borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
    boxShadow: theme === 'dark' 
      ? '0 2px 8px rgba(0, 0, 0, 0.15)'
      : '0 2px 8px rgba(0, 0, 0, 0.1)',
    borderRadius: '12px',
    padding: '15px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px'
  }), [theme]);

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

  // Reset scroll position when resetScrollKey changes (tab switch)
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [resetScrollKey]);

  // Reset scroll position when category changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      if (typeof scrollContainerRef.current.scrollTo === 'function') {
        scrollContainerRef.current.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      } else {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
    // Reset display limit when category changes
    setDisplayLimit(20);
  }, [selectedCategory]);

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

  // Check scroll buttons visibility
  useEffect(() => {
    const checkScroll = () => {
      if (categoryScrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = categoryScrollRef.current;
        setShowScrollButtons({
          left: scrollLeft > 0,
          right: scrollLeft < scrollWidth - clientWidth - 1
        });
      }
    };

    checkScroll();
    window.addEventListener('resize', checkScroll);
    
    const scrollEl = categoryScrollRef.current;
    if (scrollEl) {
      scrollEl.addEventListener('scroll', checkScroll);
    }

    return () => {
      window.removeEventListener('resize', checkScroll);
      if (scrollEl) {
        scrollEl.removeEventListener('scroll', checkScroll);
      }
    };
  }, [isMobile]);

  // Scroll category functions
  const scrollCategoryLeft = () => {
    if (categoryScrollRef.current) {
      if (typeof categoryScrollRef.current.scrollBy === 'function') {
        categoryScrollRef.current.scrollBy({
          left: -200,
          behavior: 'smooth'
        });
      } else {
        categoryScrollRef.current.scrollLeft -= 200;
      }
    }
  };

  const scrollCategoryRight = () => {
    if (categoryScrollRef.current) {
      if (typeof categoryScrollRef.current.scrollBy === 'function') {
        categoryScrollRef.current.scrollBy({
          left: 200,
          behavior: 'smooth'
        });
      } else {
        categoryScrollRef.current.scrollLeft += 200;
      }
    }
  };

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

  // Helper function to remove Vietnamese accents for better search
  const removeVietnameseAccents = (str: string): string => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  };

  // Enhanced search function with fuzzy matching - OPTIMIZED
  const fuzzySearch = React.useCallback((text: string, query: string): boolean => {
    if (!text || !query) return false;
    
    const normalizedText = removeVietnameseAccents(text.toLowerCase());
    const normalizedQuery = removeVietnameseAccents(query.toLowerCase());
    
    // Exact match - fastest check first
    if (normalizedText.includes(normalizedQuery)) return true;
    
    // Word-by-word match (tìm từng từ riêng lẻ)
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
    if (queryWords.length > 1) {
      const allWordsMatch = queryWords.every(word => normalizedText.includes(word));
      if (allWordsMatch) return true;
    }
    
    // Skip expensive regex for short queries
    return false;
  }, []);

  // Filter places by search and category - Memoized with DEBOUNCED search
  const filteredBySearchAndCategory = React.useMemo(() => {
    return places.filter(place => {
      const placeCategory = normalizeCategory(place);
      
      // OPTIMIZED search: chỉ tìm trong tên và địa chỉ (bỏ description để tăng tốc)
      // Use DEBOUNCED search query to prevent lag
      const matchesSearch = !debouncedSearchQuery || 
        fuzzySearch(place.name || '', debouncedSearchQuery) ||
        fuzzySearch(place.location?.address || '', debouncedSearchQuery);
      
      const matchesCategory = selectedCategory === 'all' || placeCategory === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [places, debouncedSearchQuery, selectedCategory, fuzzySearch]);

  // Filter by radius - LUÔN áp dụng nếu không phải "Tất cả" - Memoized
  const filteredByRadius = React.useMemo(() => {
    return filteredBySearchAndCategory.filter(place => {
      // Nếu chọn "Tất cả" → không lọc theo radius
      if (selectedRadius === 'all') return true;
      
      // Nếu chọn radius cụ thể → chỉ hiện địa điểm có distance và trong bán kính
      return place.distance !== undefined && place.distance <= selectedRadius;
    });
  }, [filteredBySearchAndCategory, selectedRadius]);

  // Apply nearby toggle - CHỈ ẩn địa điểm không có distance khi bật - Memoized
  const nearbyFilteredPlaces = React.useMemo(() => {
    return showNearbyOnly 
      ? filteredByRadius.filter(place => place.distance !== undefined) // Chỉ hiện địa điểm có distance
      : filteredByRadius; // Hiện tất cả (đã được lọc theo radius ở trên)
  }, [filteredByRadius, showNearbyOnly]);

  // Sort places - Memoized
  const sortedPlaces = React.useMemo(() => {
    return [...nearbyFilteredPlaces].sort((a, b) => {
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
  }, [nearbyFilteredPlaces, sortBy]);

  // Limit displayed places for performance - only show first N items
  const displayedPlaces = React.useMemo(() => {
    return sortedPlaces.slice(0, displayLimit);
  }, [sortedPlaces, displayLimit]);

  // Setup Intersection Observer for lazy loading more items
  useEffect(() => {
    if (!loadMoreTriggerRef.current || sortedPlaces.length <= displayLimit) return;

    loadMoreObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Load 20 more items when trigger is visible
          setDisplayLimit(prev => Math.min(prev + 20, sortedPlaces.length));
        }
      },
      { rootMargin: '200px' } // Start loading 200px before reaching the trigger
    );

    loadMoreObserverRef.current.observe(loadMoreTriggerRef.current);

    return () => {
      if (loadMoreObserverRef.current) {
        loadMoreObserverRef.current.disconnect();
      }
    };
  }, [sortedPlaces.length, displayLimit]);

  // Debug logging - DISABLED to reduce console spam
  // logger.log('🔍 PlaceList Debug:', {
  //   totalPlaces: places.length,
  //   afterSearchAndCategory: filteredBySearchAndCategory.length,
  //   afterRadius: filteredByRadius.length,
  //   afterNearbyToggle: nearbyFilteredPlaces.length,
  //   finalSorted: sortedPlaces.length,
  //   selectedRadius,
  //   showNearbyOnly,
  //   sortBy,
  //   userLocation
  // });

  // Create lookup maps for O(1) access instead of O(n) filtering - CRITICAL for performance
  const visitorsByPlace = React.useMemo(() => {
    const map = new Map<string, CheckIn[]>();
    checkIns.forEach(checkIn => {
      if (checkIn.visibility === 'public') {
        const existing = map.get(checkIn.placeId) || [];
        existing.push(checkIn);
        map.set(checkIn.placeId, existing);
      }
    });
    return map;
  }, [checkIns]);

  const eventsByPlace = React.useMemo(() => {
    const map = new Map<string, PlaceEvent[]>();
    events.forEach(event => {
      const existing = map.get(event.placeId) || [];
      existing.push(event);
      map.set(event.placeId, existing);
    });
    return map;
  }, [events]);

  const userCheckInByPlace = React.useMemo(() => {
    const map = new Map<string, CheckIn>();
    checkIns.forEach(checkIn => {
      if (checkIn.userId === currentUser.uid) {
        map.set(checkIn.placeId, checkIn);
      }
    });
    return map;
  }, [checkIns, currentUser.uid]);

  // Fast lookup functions using maps - O(1) instead of O(n)
  const getPlaceVisitors = (placeId: string): CheckIn[] => {
    return visitorsByPlace.get(placeId) || [];
  };

  const getPlaceEvents = (placeId: string): PlaceEvent[] => {
    return eventsByPlace.get(placeId) || [];
  };

  const getUserCheckIn = (placeId: string): CheckIn | undefined => {
    return userCheckInByPlace.get(placeId);
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
    <div className="h-full flex flex-col" style={{ maxHeight: '100vh' }}>
      {/* Simple Sticky Header - Giao diện ban đầu */}
      <div 
        className="sticky top-0 z-30 flex-shrink-0"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.98)' : 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
        }}
      >
        <div className={`${isMobile ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm địa điểm..."
              className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                color: theme === 'dark' ? '#ffffff' : '#000000',
                fontWeight: 600
              }}
            />
            {/* Loading indicator when debouncing */}
            {searchQuery !== debouncedSearchQuery && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            {/* Clear button when there's text */}
            {searchQuery && searchQuery === debouncedSearchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
          </div>

          {/* Category Pills - Cuộn ngang với nút điều khiển (chỉ desktop) */}
          <div className="relative mb-2">
            {/* Nút scroll trái - CHỈ HIỆN TRÊN DESKTOP */}
            {!isMobile && showScrollButtons.left && (
              <button
                onClick={scrollCategoryLeft}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                style={{
                  background: theme === 'dark'
                    ? 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)'
                    : 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)',
                  boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)'
                }}
                aria-label="Cuộn trái"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
            )}

            {/* Nút scroll phải - CHỈ HIỆN TRÊN DESKTOP */}
            {!isMobile && showScrollButtons.right && (
              <button
                onClick={scrollCategoryRight}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                style={{
                  background: theme === 'dark'
                    ? 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)'
                    : 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)',
                  boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)'
                }}
                aria-label="Cuộn phải"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            )}

            {/* Category scroll container */}
            <div 
              ref={categoryScrollRef}
              className="flex gap-2 overflow-x-auto pb-2 scroll-smooth scrollbar-hide relative"
              style={{
                WebkitOverflowScrolling: 'touch',
                paddingLeft: !isMobile && showScrollButtons.left ? '40px' : '0',
                paddingRight: !isMobile && showScrollButtons.right ? '40px' : '0'
              }}
            >
              <button
                onClick={() => setSelectedCategory('all')}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                  selectedCategory === 'all'
                    ? 'text-white shadow-lg scale-105'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
                style={
                  selectedCategory === 'all'
                    ? {
                        background: theme === 'dark'
                          ? 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)'
                          : 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)'
                      }
                    : {
                        backgroundColor: theme === 'dark' ? '#374151' : '#ffffff',
                        color: theme === 'dark' ? '#D1D5DB' : '#374151',
                        border: `1px solid ${theme === 'dark' ? '#4B5563' : '#e5e7eb'}`
                      }
                }
              >
                Tất cả
              </button>
              {(Object.keys(CATEGORY_LABELS) as string[]).map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category as PlaceCategory)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
                    selectedCategory === category
                      ? 'text-white shadow-lg scale-105'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                  style={
                    selectedCategory === category
                      ? {
                          background: theme === 'dark'
                            ? 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)'
                            : 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)'
                        }
                      : {
                          backgroundColor: theme === 'dark' ? '#374151' : '#ffffff',
                          color: theme === 'dark' ? '#D1D5DB' : '#374151',
                          border: `1px solid ${theme === 'dark' ? '#4B5563' : '#e5e7eb'}`
                        }
                  }
                >
                  {CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>

            {/* Gradient Fade - CHỈ MOBILE, chỉ khi có thể scroll - REMOVED để tránh vệt trắng */}
          </div>

          {/* Results Counter */}
          <div 
            className="py-1.5 px-3 rounded-lg"
            style={{
              backgroundColor: theme === 'dark' ? 'rgba(79, 70, 229, 0.15)' : 'rgba(79, 70, 229, 0.08)',
              borderLeft: `3px solid ${theme === 'dark' ? '#8B5CF6' : '#6366F1'}`
            }}
          >
            <span 
              className="text-sm font-bold"
              style={{ color: theme === 'dark' ? '#E5E7EB' : '#1F2937' }}
            >
              {sortedPlaces.length} địa điểm
            </span>
          </div>
        </div>
      </div>

      {/* Places List - HERO SECTION */}
      <div 
        ref={scrollContainerRef}
        className="overflow-y-auto"
        style={{
          flex: '1 1 0',
          minHeight: 0,
          height: '100%',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: isMobile ? '16px 12px 120px' : '20px 16px 24px'
        }}
      >
        {sortedPlaces.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Không tìm thấy địa điểm nào</p>
          </div>
        ) : (
          <>
            <div className="space-y-4"> {/* Tăng gap để cards tách biệt rõ hơn */}
              {displayedPlaces.map(place => {
              const visitors = getPlaceVisitors(place.id!);
              const placeEvents = getPlaceEvents(place.id!);
              const normalizedCategory = normalizeCategory(place);
              const userCheckIn = getUserCheckIn(place.id!);

              return (
                <PlaceCard
                  key={place.id}
                  place={place}
                  visitors={visitors}
                  placeEvents={placeEvents}
                  normalizedCategory={normalizedCategory}
                  userCheckIn={userCheckIn}
                  userLocation={userLocation}
                  isExpanded={expandedDescriptions.has(place.id!)}
                  categoryLabel={CATEGORY_LABELS[normalizedCategory]}
                  onPlaceSelect={onPlaceSelect}
                  onCheckIn={onCheckIn}
                  onDeleteCheckIn={handleDeleteCheckIn}
                  onToggleDescription={toggleDescription}
                  onProfileClick={onProfileClick}
                  getRating={getRating}
                  isMobile={isMobile}
                />
              );
            })}
            </div>

            {/* Load More Trigger - Invisible element for Intersection Observer */}
            {displayLimit < sortedPlaces.length && (
              <div 
                ref={loadMoreTriggerRef}
                className="py-8 text-center"
              >
                <div className="inline-flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  Đang tải thêm...
                </div>
              </div>
            )}

            {/* Show total count */}
            {displayLimit >= sortedPlaces.length && sortedPlaces.length > 20 && (
              <div className="py-4 text-center text-sm text-gray-500">
                Đã hiển thị tất cả {sortedPlaces.length} địa điểm
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
