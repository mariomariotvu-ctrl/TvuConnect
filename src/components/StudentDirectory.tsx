import { User } from 'firebase/auth';
import {
  Check,
  Clock3,
  Compass,
  GraduationCap,
  Loader2,
  MapPin,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import {
  connectionStateFor,
  FriendAction,
  manageFriendConnection,
  subscribeFriendConnections,
  subscribeIncomingFriendRequests,
  subscribeOutgoingFriendRequests,
} from '../services/friendConnectionService';
import {
  disableNearbyDiscovery,
  DiscoveredStudent,
  enableNearbyDiscovery,
  getStudentProfilesByIds,
  isNewStudent,
  profileMatches,
  searchStudentPage,
  sortDiscoveredStudents,
  StudentPageCursor,
  StudentSearchFilters,
} from '../services/studentDirectoryService';
import { FriendRequest, Friendship, StudentProfile } from '../types';
import { playAppSound } from '../utils/appSounds';
import { formatDistance } from '../utils/locationUtils';
import { isMajorMatch } from '../utils/matchingUtils';
import { requestBrowserLocation } from '../utils/proximity';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = searchParams.get('tab');
  const tab = selectedTab === 'friends' || selectedTab === 'requests' ? selectedTab : 'new';
  const [requestDirection, setRequestDirection] = useState<'incoming' | 'outgoing'>('incoming');
  const [filters, setFilters] = useState<StudentSearchFilters>(EMPTY_FILTERS);
  const [students, setStudents] = useState<DiscoveredStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<StudentPageCursor>();
  const [loadError, setLoadError] = useState(false);
  const [relatedProfiles, setRelatedProfiles] = useState<StudentProfile[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState(false);
  const [connectionsReady, setConnectionsReady] = useState({ friends: false, incoming: false, outgoing: false });
  const [connectionsError, setConnectionsError] = useState(false);
  const [reload, setReload] = useState(0);
  const requestSequence = useRef(0);
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
  const { blockedSet, isLoading: blocksLoading, error: blocksError } = useBlockedUsers(currentUser.uid);


  useEffect(() => {
    setNearbyEnabled(currentProfile?.nearbyOptIn === true);
  }, [currentProfile?.nearbyOptIn]);

  useEffect(() => {
    setConnectionsReady({ friends: false, incoming: false, outgoing: false });
    setConnectionsError(false);
    incomingRequestsReadyRef.current = false;
    seenIncomingRequestIdsRef.current.clear();
    const reportError = (error: Error) => {
      console.error('Could not load friend connections:', error);
      setConnectionsError(true);
      toast.error('Chưa thể đồng bộ lời mời kết bạn. Vui lòng thử lại.');
    };
    const unsubscribeFriendships = subscribeFriendConnections(currentUser.uid, (items) => {
      setFriendships(items);
      setConnectionsReady(previous => ({ ...previous, friends: true }));
    }, reportError);
    const unsubscribeIncoming = subscribeIncomingFriendRequests(currentUser.uid, (requests) => {
      setIncomingRequests(requests);
      setConnectionsReady(previous => ({ ...previous, incoming: true }));
      if (!incomingRequestsReadyRef.current) {
        requests.forEach((request) => seenIncomingRequestIdsRef.current.add(request.id));
        incomingRequestsReadyRef.current = true;
        return;
      }

      const hasNewRequest = requests.some((request) => !seenIncomingRequestIdsRef.current.has(request.id));
      requests.forEach((request) => seenIncomingRequestIdsRef.current.add(request.id));
      if (hasNewRequest) void playAppSound('friend-request', { cooldownMs: 1_000 });
    }, reportError);
    const unsubscribeOutgoing = subscribeOutgoingFriendRequests(currentUser.uid, (requests) => {
      setOutgoingRequests(requests);
      setConnectionsReady(previous => ({ ...previous, outgoing: true }));
    }, reportError);
    return () => {
      unsubscribeFriendships();
      unsubscribeIncoming();
      unsubscribeOutgoing();
    };
  }, [currentUser.uid, reload]);

  const friendUids = useMemo(() => [...new Set(friendships.flatMap(friendship => friendship.participantUids))]
    .filter(uid => uid !== currentUser.uid && !blockedSet.has(uid)), [friendships, currentUser.uid, blockedSet]);
  const incomingUids = useMemo(() => incomingRequests.map(request => request.fromUid)
    .filter(uid => !blockedSet.has(uid)), [incomingRequests, blockedSet]);
  const outgoingUids = useMemo(() => outgoingRequests.map(request => request.toUid)
    .filter(uid => !blockedSet.has(uid)), [outgoingRequests, blockedSet]);
  const relatedIdsKey = JSON.stringify(tab === 'friends' ? friendUids : tab === 'requests'
    ? (requestDirection === 'incoming' ? incomingUids : outgoingUids) : []);

  useEffect(() => {
    let active = true;
    const ids: string[] = JSON.parse(relatedIdsKey);
    setRelatedError(false);
    setRelatedProfiles([]);
    if (!ids.length) { setRelatedLoading(false); return; }
    setRelatedLoading(true);
    void getStudentProfilesByIds(ids).then(profiles => {
      if (active) setRelatedProfiles(profiles);
    }).catch(error => {
      console.error('Could not load connected profiles:', error);
      if (active) setRelatedError(true);
    }).finally(() => { if (active) setRelatedLoading(false); });
    return () => { active = false; };
  }, [relatedIdsKey, reload]);

  const loadStudents = useCallback(async (nextFilters = filters, location = currentLocation) => {
    const sequence = ++requestSequence.current;
    setNextCursor(undefined);
    setLoadError(false);
    if (nextFilters.nearbyOnly && !location) {
      setStudents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await searchStudentPage(currentUser.uid, nextFilters, location);
      if (sequence !== requestSequence.current) return;
      setStudents(result.students);
      setNextCursor(result.nextCursor);
    } catch (error) {
      console.error('Could not load student directory:', error);
      if (sequence === requestSequence.current) setLoadError(true);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [currentLocation, currentUser.uid, filters]);

  useEffect(() => {
    if (tab !== 'new') return;
    const timer = window.setTimeout(() => {
      void loadStudents();
    }, 250);

    return () => { window.clearTimeout(timer); requestSequence.current += 1; };
  }, [loadStudents, tab, reload]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const sequence = requestSequence.current;
    setLoadingMore(true);
    try {
      const page = await searchStudentPage(currentUser.uid, filters, currentLocation, nextCursor);
      if (sequence !== requestSequence.current) return;
      setStudents(previous => sortDiscoveredStudents([...new Map([...previous, ...page.students].map(student => [student.profile.uid, student])).values()], filters.nearbyOnly));
      setNextCursor(page.nextCursor);
    } catch {
      if (sequence === requestSequence.current) toast.error('Chưa tải được trang tiếp theo. Bạn có thể thử lại.');
    } finally { setLoadingMore(false); }
  };

  const selectTab = (next: 'new' | 'friends' | 'requests') => {
    requestSequence.current += 1;
    setSearchParams({ tab: next });
    setFilters(EMPTY_FILTERS);
  };

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

  const updateConnection = async (friendUid: string, explicitAction?: FriendAction) => {
    const state = connectionStateFor(
      friendUid,
      currentUser.uid,
      friendships,
      incomingRequests,
      outgoingRequests,
    );
    if (state === 'accepted' && !explicitAction) return;

    const action = explicitAction || (state === 'incoming' ? 'accept' : state === 'pending' ? 'cancel' : 'send');
    setConnectionBusyUid(friendUid);
    try {
      await manageFriendConnection(friendUid, action);
      if (action === 'accept') {
        void playAppSound('success');
        toast.success('Đã kết bạn. Hai bạn có thể chia sẻ vị trí cho nhau.');
      }
      if (action === 'send') toast.success('Đã gửi lời mời kết bạn.');
      if (action === 'cancel') toast.success('Đã thu hồi lời mời.');
      if (action === 'decline') toast.success('Đã từ chối lời mời.');
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

  const visibleStudents = useMemo(() => {
    const allowed = new Set(JSON.parse(relatedIdsKey) as string[]);
    const list: DiscoveredStudent[] = tab === 'new' ? students : relatedProfiles
      .filter(profile => allowed.has(profile.uid) && profileMatches(profile, filters))
      .sort((left, right) => tab === 'friends'
        ? left.fullName.localeCompare(right.fullName, 'vi')
        : [...allowed].indexOf(left.uid) - [...allowed].indexOf(right.uid))
      .map(profile => ({ profile }));
    return list.filter(({ profile }) => !blockedSet.has(profile.uid));
  }, [tab, students, relatedProfiles, relatedIdsKey, filters, blockedSet]);
  const listLoading = blocksLoading || (tab === 'new' ? loading : relatedLoading || (!connectionsError && !(
    tab === 'friends' ? connectionsReady.friends : connectionsReady[requestDirection]
  )));
  const listError = Boolean(blocksError) || (tab === 'new' ? loadError : relatedError || connectionsError);

  return (
    <section className="max-w-5xl mx-auto pb-8">
      <header className="mb-5 px-1">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Tìm bạn & giữ kết nối</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Làm quen bạn mới, giữ liên lạc với bạn bè tại TVU.
        </p>
      </header>

      <nav aria-label="Danh sách kết nối" className="mb-5 grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
        {([
          { id: 'new', label: 'Bạn mới', count: 0 },
          { id: 'friends', label: 'Bạn bè', count: friendUids.length },
          { id: 'requests', label: 'Lời mời', count: incomingUids.length },
        ] as const).map(item => (
          <button key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined} onClick={() => selectTab(item.id)}
            className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-1 text-sm font-bold ${tab === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            {item.label}{' '}{item.count > 0 && <span className={`rounded-full px-1.5 text-xs ${tab === item.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{item.count}</span>}
          </button>
        ))}
      </nav>

      {tab !== 'requests' && incomingUids.length > 0 && (
        <button type="button" onClick={() => selectTab('requests')} className="mb-4 flex min-h-12 w-full items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-left text-sm text-indigo-800 dark:bg-indigo-950/35 dark:text-indigo-200">
          <UserPlus className="h-4 w-4 shrink-0" />
          <span className="flex-1 font-semibold">Bạn có {incomingUids.length} lời mời kết bạn</span>
          <span className="shrink-0 underline underline-offset-4">Xem lời mời</span>
        </button>
      )}

      {tab === 'requests' && (
        <div className="mb-4 flex gap-2" aria-label="Loại lời mời">
          {(['incoming', 'outgoing'] as const).map(direction => <button key={direction} type="button" aria-pressed={requestDirection === direction}
            onClick={() => setRequestDirection(direction)} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${requestDirection === direction ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200' : 'text-slate-500'}`}>
            {direction === 'incoming' ? `Đã nhận (${incomingUids.length})` : `Đã gửi (${outgoingUids.length})`}
          </button>)}
        </div>
      )}

      <div className="rounded-2xl border p-3 md:p-4 bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 shadow-sm mb-5">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              aria-label="Tìm tên, lớp, ngành học"
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
            aria-label="Bộ lọc danh sách"
            aria-expanded={showFilters}
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
          {tab === 'new' && <button
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
          </button>}
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

        {tab === 'new' && (filters.nearbyOnly || nearbyEnabled) && <div className="mt-3 flex items-start gap-2 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <p>Chỉ chia sẻ khu vực gần đúng khoảng 1–2 km, không công khai vị trí chính xác.</p>
            {nearbyEnabled && <button type="button" onClick={() => void disableNearby()} disabled={sharingLocation} className="min-h-9 font-semibold text-emerald-700 underline dark:text-emerald-300 disabled:opacity-60">
              {sharingLocation ? 'Đang cập nhật…' : 'Dừng chia sẻ vị trí'}
            </button>}
          </div>
        </div>}
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">{tab === 'new' ? (filters.nearbyOnly ? 'Ưu tiên gần bạn trong các kết quả đã tải' : 'Mới tham gia trước · Nhãn Bạn mới trong 7 ngày') : tab === 'friends' ? 'Những người đã chấp nhận kết bạn với bạn' : 'Chấp nhận, từ chối hoặc thu hồi lời mời'}</p>
        <button type="button" onClick={() => setReload(value => value + 1)} aria-label="Làm mới danh sách" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 dark:border-slate-700"><RefreshCw size={17} /></button>
      </div>

      {listError ? (
        <div role="alert" className="rounded-2xl border border-rose-200 p-6 text-center text-sm text-rose-700">
          Chưa tải được danh sách. <button type="button" onClick={() => setReload(value => value + 1)} className="min-h-11 font-bold underline">Thử lại</button>
        </div>
      ) : listLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-52 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : visibleStudents.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center bg-slate-50 dark:bg-slate-800/40">
          <Users className="w-12 h-12 mx-auto mb-3 text-indigo-400" />
          <h2 className="font-black text-lg text-slate-900 dark:text-white">{tab === 'friends' && !activeFilters ? 'Bạn chưa kết nối với ai' : tab === 'requests' && !activeFilters ? 'Chưa có lời mời trong mục này' : 'Chưa tìm thấy bạn phù hợp'}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {tab === 'friends' && !activeFilters ? 'Qua mục Bạn mới để làm quen. Sau khi lời mời được chấp nhận, bạn bè sẽ xuất hiện ở đây.' : tab === 'requests' && !activeFilters ? 'Lời mời mới sẽ tự xuất hiện tại đây khi được gửi.' : 'Thử đổi từ khóa, ngành học hoặc xem thêm kết quả.'}
          </p>
          {tab === 'friends' && <button type="button" onClick={() => selectTab('new')} className="mt-4 min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white">Khám phá bạn mới</button>}
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Đang hiển thị {visibleStudents.length} {tab === 'friends' ? 'bạn bè' : 'sinh viên'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleStudents.map(({ profile, distanceKm }) => {
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
                      {isNewStudent(profile) && <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Bạn mới</span>}
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
                  {tab === 'requests' && connectionState === 'incoming' && <button type="button" disabled={connectionBusyUid === profile.uid}
                    onClick={() => void updateConnection(profile.uid, 'decline')} className="mt-2 min-h-10 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900">Từ chối lời mời</button>}
                </article>
              );
            })}
          </div>
        </>
      )}

      {tab === 'new' && nextCursor && !loading && !loadError && <div className="mt-5 text-center">
        <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-bold text-indigo-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-indigo-300">
          {loadingMore ? 'Đang tải…' : 'Xem thêm bạn'}
        </button>
      </div>}

      <div className="mt-6 flex gap-2 text-xs text-slate-500 dark:text-slate-400">
        <GraduationCap className="w-4 h-4 flex-shrink-0" />
        <p>Chỉ kết nối với sinh viên đã có hồ sơ. Hãy nhắn tin trước khi gọi để tôn trọng quyền riêng tư của nhau.</p>
      </div>
    </section>
  );
};
