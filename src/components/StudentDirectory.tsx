import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Compass,
  Check,
  Clock3,
  GraduationCap,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { FriendRequest, Friendship, StudentProfile } from '../types';
import {
  disableNearbyDiscovery,
  DiscoveredStudent,
  enableNearbyDiscovery,
  searchStudents,
  StudentSearchFilters,
} from '../services/studentDirectoryService';
import { formatDistance } from '../utils/locationUtils';
import { requestBrowserLocation } from '../utils/proximity';
import { isMajorMatch } from '../utils/matchingUtils';
import { useTheme } from '../contexts/ThemeContext';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import {
  connectionStateFor,
  manageFriendConnection,
  subscribeFriendConnections,
  subscribeIncomingFriendRequests,
  subscribeOutgoingFriendRequests,
} from '../services/friendConnectionService';
import { playAppSound } from '../utils/appSounds';

interface StudentDirectoryProps {
  currentUser: User;
  currentProfile: StudentProfile | null;
  onStartChat: (uid: string) => void;
}

const EMPTY_FILTERS: StudentSearchFilters = {
  keyword: '',
  major: '',
  academicYear: '',
  nearbyOnly: false,
};

const initials = (name: string) => name
  .trim()
  .split(/\s+/)
  .slice(-2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

export const StudentDirectory: React.FC<StudentDirectoryProps> = ({
  currentUser,
  currentProfile,
  onStartChat,
}) => {
  const { theme } = useTheme();
  const [filters, setFilters] = useState<StudentSearchFilters>(EMPTY_FILTERS);
  const [students, setStudents] = useState<DiscoveredStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | undefined>();
  const [showFilters, setShowFilters] = useState(false);
  const [nearbyEnabled, setNearbyEnabled] = useState(currentProfile?.nearbyOptIn === true);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [connectionBusyUid, setConnectionBusyUid] = useState<string | null>(null);
  const incomingRequestsReadyRef = useRef(false);
  const seenIncomingRequestIdsRef = useRef(new Set<string>());
  const { blockedSet } = useBlockedUsers(currentUser.uid);

  const isDark = theme === 'dark';
  const hasNearbyPresence = nearbyEnabled;

  useEffect(() => {
    setNearbyEnabled(currentProfile?.nearbyOptIn === true);
  }, [currentProfile?.nearbyOptIn]);

  useEffect(() => {
    const reportError = (error: Error) => {
      console.error('Could not load friend connections:', error);
      toast.error('Chưa thể đồng bộ lời mời kết bạn. Vui lòng thử lại.');
    };
    const unsubscribeFriendships = subscribeFriendConnections(currentUser.uid, setFriendships, reportError);
    const unsubscribeIncoming = subscribeIncomingFriendRequests(currentUser.uid, (requests) => {
      setIncomingRequests(requests);
      if (!incomingRequestsReadyRef.current) {
        requests.forEach((request) => seenIncomingRequestIdsRef.current.add(request.id));
        incomingRequestsReadyRef.current = true;
        return;
      }

      const hasNewRequest = requests.some((request) => !seenIncomingRequestIdsRef.current.has(request.id));
      requests.forEach((request) => seenIncomingRequestIdsRef.current.add(request.id));
      if (hasNewRequest) void playAppSound('friend-request', { cooldownMs: 1_000 });
    }, reportError);
    const unsubscribeOutgoing = subscribeOutgoingFriendRequests(currentUser.uid, setOutgoingRequests, reportError);
    return () => {
      unsubscribeFriendships();
      unsubscribeIncoming();
      unsubscribeOutgoing();
    };
  }, [currentUser.uid]);

  const loadStudents = useCallback(async (nextFilters = filters, location = currentLocation) => {
    if (nextFilters.nearbyOnly && !location) {
      setStudents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const results = await searchStudents(currentUser.uid, nextFilters, location);
      setStudents(results.filter(({ profile }) => !blockedSet.has(profile.uid)));
    } catch (error) {
      console.error('Could not load student directory:', error);
      toast.error('Chưa thể tải danh sách sinh viên. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [blockedSet, currentLocation, currentUser.uid, filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStudents();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [loadStudents]);

  const updateFilters = (changes: Partial<StudentSearchFilters>) => {
    setFilters((previous) => ({ ...previous, ...changes }));
  };

  const enableNearby = async () => {
    setSharingLocation(true);
    try {
      const location = await requestBrowserLocation();
      await enableNearbyDiscovery(currentUser.uid, location);
      setNearbyEnabled(true);
      setCurrentLocation(location);
      const nextFilters = { ...filters, nearbyOnly: true };
      setFilters(nextFilters);
      await loadStudents(nextFilters, location);
      toast.success('Đã bật tìm bạn quanh đây. Vị trí chỉ được lưu ở mức gần đúng.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể bật tìm quanh đây.');
    } finally {
      setSharingLocation(false);
    }
  };

  const disableNearby = async () => {
    setSharingLocation(true);
    try {
      await disableNearbyDiscovery(currentUser.uid);
      setNearbyEnabled(false);
      setCurrentLocation(undefined);
      const nextFilters = { ...filters, nearbyOnly: false };
      setFilters(nextFilters);
      await loadStudents(nextFilters, undefined);
      toast.success('Đã dừng chia sẻ vị trí gần đúng.');
    } catch (error) {
      console.error('Could not disable nearby discovery:', error);
      toast.error('Không thể cập nhật quyền riêng tư. Vui lòng thử lại.');
    } finally {
      setSharingLocation(false);
    }
  };

  const showNearbyResults = async () => {
    if (!currentLocation) {
      await enableNearby();
      return;
    }

    updateFilters({ nearbyOnly: !filters.nearbyOnly });
  };

  const updateConnection = async (friendUid: string) => {
    const state = connectionStateFor(
      friendUid,
      currentUser.uid,
      friendships,
      incomingRequests,
      outgoingRequests,
    );
    if (state === 'accepted') return;

    const action = state === 'incoming' ? 'accept' : state === 'pending' ? 'cancel' : 'send';
    setConnectionBusyUid(friendUid);
    try {
      await manageFriendConnection(friendUid, action);
      if (action === 'accept') {
        void playAppSound('success');
        toast.success('Đã kết bạn. Hai bạn có thể chia sẻ vị trí cho nhau.');
      }
      if (action === 'send') toast.success('Đã gửi lời mời kết bạn.');
      if (action === 'cancel') toast.success('Đã thu hồi lời mời.');
    } catch (connectionError) {
      console.error('Could not update friend connection:', connectionError);
      toast.error('Chưa thể cập nhật lời mời kết bạn. Vui lòng thử lại.');
    } finally {
      setConnectionBusyUid(null);
    }
  };

  const activeFilters = useMemo(() => [
    filters.keyword,
    filters.major,
    filters.academicYear,
    filters.nearbyOnly ? 'nearby' : '',
  ].filter(Boolean).length, [filters]);

  return (
    <section className="max-w-5xl mx-auto pb-8">
      <div
        className="rounded-[2rem] p-5 md:p-7 mb-5 border overflow-hidden relative"
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(49,46,129,.45), rgba(30,64,175,.25))'
            : 'linear-gradient(135deg, #eef2ff, #eff6ff)',
          borderColor: isDark ? 'rgba(129,140,248,.35)' : '#c7d2fe',
        }}
      >
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-indigo-300/20 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-4 md:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-lg flex-shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-300">Cộng đồng sinh viên TVU</p>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Tìm bạn học, bạn cùng ngành</h1>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
                Tìm theo tên, lớp, ngành hoặc xem các bạn đang ở gần bạn. Không hiển thị vị trí chính xác của bất kỳ ai.
              </p>
            </div>
          </div>

          {hasNearbyPresence ? (
            <button
              onClick={() => void disableNearby()}
              disabled={sharingLocation}
              className="shrink-0 px-4 py-3 rounded-xl text-sm font-bold border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 disabled:opacity-60"
            >
              {sharingLocation ? 'Đang cập nhật…' : 'Dừng chia sẻ vị trí'}
            </button>
          ) : (
            <button
              onClick={() => void enableNearby()}
              disabled={sharingLocation}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg hover:opacity-90 disabled:opacity-60"
            >
              {sharingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              Chia sẻ vị trí gần đúng
            </button>
          )}
        </div>

        <div className="relative mt-4 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
          <span>Chỉ dùng ô vị trí khoảng 1–2 km để xếp hạng kết quả. Bạn có thể tắt bất cứ lúc nào.</span>
        </div>
      </div>

      {incomingRequests.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/35 dark:text-indigo-100">
          <UserPlus className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black">Bạn có {incomingRequests.length} lời mời kết bạn</p>
            <p className="mt-0.5 text-xs opacity-80">Người gửi sẽ có nút “Chấp nhận” trong danh sách bên dưới.</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border p-3 md:p-4 bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 shadow-sm mb-5">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              value={filters.keyword}
              onChange={(event) => updateFilters({ keyword: event.target.value })}
              placeholder="Tìm tên, lớp, ngành học…"
              className="w-full min-h-12 pl-10 pr-9 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {filters.keyword && (
              <button
                type="button"
                onClick={() => updateFilters({ keyword: '' })}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                aria-label="Xóa từ khóa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setShowFilters((visible) => !visible)}
            className={`min-h-12 px-3 rounded-xl border font-bold text-sm inline-flex items-center gap-2 ${
              showFilters || activeFilters > 0
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Lọc</span>
            {activeFilters > 0 && <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">{activeFilters}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Ngành học
              <input
                value={filters.major}
                onChange={(event) => updateFilters({ major: event.target.value })}
                placeholder="Ví dụ: Công nghệ thông tin"
                className="mt-1.5 w-full min-h-11 px-3 rounded-xl border bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Niên khóa
              <input
                value={filters.academicYear}
                onChange={(event) => updateFilters({ academicYear: event.target.value })}
                placeholder="Ví dụ: 2023 - 2027"
                className="mt-1.5 w-full min-h-11 px-3 rounded-xl border bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => void showNearbyResults()}
            disabled={sharingLocation}
            className={`px-3 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
              filters.nearbyOnly
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
            }`}
          >
            <Compass className="w-4 h-4" /> Quanh đây
          </button>
          {currentProfile?.major && (
            <button
              type="button"
              onClick={() => updateFilters({ major: filters.major === currentProfile.major ? '' : currentProfile.major })}
              className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                filters.major === currentProfile.major
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300'
              }`}
            >
              Cùng ngành của bạn
            </button>
          )}
          {currentProfile?.academicYear && (
            <button
              type="button"
              onClick={() => updateFilters({ academicYear: filters.academicYear === currentProfile.academicYear ? '' : currentProfile.academicYear })}
              className={`px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
                filters.academicYear === currentProfile.academicYear
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300'
              }`}
            >
              Cùng khóa
            </button>
          )}
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="px-3 py-2 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-52 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center bg-slate-50 dark:bg-slate-800/40">
          <Users className="w-12 h-12 mx-auto mb-3 text-indigo-400" />
          <h2 className="font-black text-lg text-slate-900 dark:text-white">Chưa tìm thấy bạn phù hợp</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Thử đổi từ khóa, ngành học hoặc mở rộng phạm vi tìm kiếm.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Tìm thấy {students.length} sinh viên</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.map(({ profile, distanceKm }) => {
              const isSameMajor = currentProfile && isMajorMatch(currentProfile.major, profile.major);
              const connectionState = connectionStateFor(
                profile.uid,
                currentUser.uid,
                friendships,
                incomingRequests,
                outgoingRequests,
              );
              const connectionLabel = connectionState === 'accepted'
                ? 'Đã là bạn bè'
                : connectionState === 'incoming'
                  ? 'Chấp nhận'
                  : connectionState === 'pending'
                    ? 'Đã gửi · Thu hồi'
                    : 'Kết bạn';
              return (
                <article key={profile.uid} className="rounded-2xl p-4 border bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                  <div className="flex items-start gap-3">
                    {profile.photoURL ? (
                      <img src={profile.photoURL} alt="" className="w-12 h-12 rounded-2xl object-cover bg-slate-100" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-black flex items-center justify-center">
                        {initials(profile.fullName)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="font-black text-slate-900 dark:text-white truncate">{profile.fullName}</h2>
                      <p className="mt-0.5 text-sm font-semibold text-indigo-600 dark:text-indigo-300 truncate">{profile.major || 'Chưa cập nhật ngành'}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 min-h-6">
                    {profile.className && <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300">{profile.className}</span>}
                    {profile.academicYear && <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300">{profile.academicYear}</span>}
                    {isSameMajor && <span className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-xs font-bold text-indigo-700 dark:text-indigo-300">Cùng ngành</span>}
                  </div>

                  {distanceKm !== undefined && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <MapPin className="w-3.5 h-3.5" /> Khoảng {formatDistance(distanceKm)} · vị trí gần đúng
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => void updateConnection(profile.uid)}
                      disabled={connectionBusyUid === profile.uid || connectionState === 'accepted'}
                      className={`min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-black transition disabled:cursor-default ${connectionState === 'accepted' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : connectionState === 'incoming' ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700' : 'border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-200'}`}
                    >
                      {connectionBusyUid === profile.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : connectionState === 'accepted' ? <UserCheck className="h-4 w-4" /> : connectionState === 'incoming' ? <Check className="h-4 w-4" /> : connectionState === 'pending' ? <Clock3 className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                      {connectionLabel}
                    </button>
                    <button
                      onClick={() => onStartChat(profile.uid)}
                      className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-2 text-xs font-black text-white hover:opacity-90 active:scale-[.98] transition"
                    >
                      <MessageCircle className="h-4 w-4" /> Nhắn tin
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-6 flex gap-2 text-xs text-slate-500 dark:text-slate-400">
        <GraduationCap className="w-4 h-4 flex-shrink-0" />
        <p>Chỉ kết nối với sinh viên đã có hồ sơ. Hãy nhắn tin trước khi gọi để tôn trọng quyền riêng tư của nhau.</p>
      </div>
    </section>
  );
};
