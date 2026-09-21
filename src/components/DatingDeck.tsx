import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Eye, EyeOff, GraduationCap, Heart, Loader2, Lock, MessageCircle, Phone, ShieldCheck, Sparkles, User as UserIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { StudentProfile } from '../types';
import { recordDatingDecision, updateDatingPreferences } from '../services/datingService';
import { getDatingErrorMessage } from '../utils/userFacingErrors';
import { ReportModal } from './ReportModal';
import { playAppSound } from '../utils/appSounds';

interface DatingDeckProps {
  currentUser: User;
  currentProfile: StudentProfile | null;
  profiles: StudentProfile[];
  loading: boolean;
  onFindProfiles: () => void;
  genderFilter: 'any' | 'male' | 'female';
  onGenderFilterChange: (gender: 'any' | 'male' | 'female') => void;
  onLoadMore: () => void;
  onStartChat: (uid: string) => void;
  onStartCall: (profile: StudentProfile) => void;
}

const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();

export const DatingDeck: React.FC<DatingDeckProps> = ({
  currentUser,
  currentProfile,
  profiles,
  loading,
  onFindProfiles,
  genderFilter,
  onGenderFilterChange,
  onLoadMore,
  onStartChat,
  onStartCall,
}) => {
  const [enabled, setEnabled] = useState(currentProfile?.datingEnabled === true);
  const [hideFace, setHideFace] = useState(currentProfile?.hideFaceInDating !== false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [deciding, setDeciding] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<StudentProfile | null>(null);
  const [reportedProfile, setReportedProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    if (!currentProfile) return;
    setEnabled(currentProfile.datingEnabled === true);
    setHideFace(currentProfile.hideFaceInDating !== false);
  }, [currentProfile?.uid, currentProfile?.datingEnabled, currentProfile?.hideFaceInDating]);

  const currentCandidate = useMemo(
    () => profiles.find((profile) => (
      !dismissed.has(profile.uid)
      && (genderFilter === 'any' || profile.gender === genderFilter)
    )) || null,
    [dismissed, genderFilter, profiles],
  );
  const isAdult = typeof currentProfile?.age === 'number' && currentProfile.age >= 18;

  const savePreferences = async (nextEnabled: boolean, nextHideFace: boolean) => {
    setSavingPreferences(true);
    try {
      await updateDatingPreferences(currentUser.uid, {
        datingEnabled: nextEnabled,
        hideFaceInDating: nextHideFace,
      });
      setEnabled(nextEnabled);
      setHideFace(nextHideFace);
      toast.success(nextEnabled ? 'Đã bật hồ sơ hẹn hò.' : 'Đã tạm ẩn hồ sơ hẹn hò.');
    } catch (error) {
      console.error('Could not update dating preferences:', error);
      toast.error('Không thể cập nhật chế độ hẹn hò.');
    } finally {
      setSavingPreferences(false);
    }
  };

  const decide = async (action: 'like' | 'pass') => {
    if (!currentCandidate || deciding) return;
    setDeciding(true);
    try {
      const result = await recordDatingDecision(currentUser.uid, currentCandidate.uid, action);
      setDismissed((current) => new Set(current).add(currentCandidate.uid));
      if (result.matched) {
        setMatchedProfile(currentCandidate);
        void playAppSound('match', { volume: 0.68 });
      }

      const remaining = profiles.filter((profile) => !dismissed.has(profile.uid) && profile.uid !== currentCandidate.uid);
      if (remaining.length <= 1) void onLoadMore();
    } catch (error) {
      console.error('Could not save dating decision:', error);
      toast.error(getDatingErrorMessage(error));
    } finally {
      setDeciding(false);
    }
  };

  const changeGenderFilter = (nextGender: 'any' | 'male' | 'female') => {
    if (nextGender === genderFilter) return;
    setDismissed(new Set());
    onGenderFilterChange(nextGender);
    void updateDatingPreferences(currentUser.uid, {
      datingGenderPreference: nextGender,
    }).catch((error) => {
      console.error('Could not remember dating gender filter:', error);
    });
  };

  if (!currentProfile) {
    return <div className="py-14 text-center"><Loader2 className="w-8 h-8 mx-auto animate-spin text-rose-500" /></div>;
  }

  if (!isAdult) {
    return (
      <div className="rounded-[2rem] border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-7 text-center">
        <ShieldCheck className="w-12 h-12 mx-auto text-amber-600" />
        <h2 className="mt-3 text-xl font-black text-slate-900 dark:text-white">Hẹn hò chỉ dành cho sinh viên từ 18 tuổi</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Hãy cập nhật ngày sinh trong hồ sơ. TVU Connect không mở chế độ này nếu chưa xác nhận đủ tuổi.</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="rounded-[2rem] overflow-hidden border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 shadow-xl">
        <div className="p-7 text-white bg-gradient-to-br from-rose-500 via-fuchsia-600 to-violet-700">
          <Sparkles className="w-9 h-9" />
          <h2 className="mt-4 text-3xl font-black">Hẹn hò có chủ đích</h2>
          <p className="mt-2 text-sm text-rose-50">Chỉ những sinh viên 18+ đã chủ động bật chế độ này mới xuất hiện. Like chỉ mở trò chuyện khi cả hai cùng thích.</p>
        </div>
        <div className="p-6">
          <label className="flex items-start gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 cursor-pointer">
            <input type="checkbox" checked={hideFace} onChange={(event) => setHideFace(event.target.checked)} className="mt-1" />
            <span><strong className="block text-slate-900 dark:text-white">Ẩn ảnh khuôn mặt khi được đề xuất</strong><span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">Người khác vẫn thấy tên, ngành, sở thích và giới thiệu của bạn, nhưng ứng dụng không tải ảnh trong thẻ hẹn hò.</span></span>
          </label>
          <button disabled={savingPreferences} onClick={() => void savePreferences(true, hideFace)} className="mt-5 w-full min-h-12 rounded-2xl bg-gradient-to-r from-rose-500 to-violet-600 text-white font-black disabled:opacity-60 inline-flex items-center justify-center gap-2">
            {savingPreferences && <Loader2 className="w-4 h-4 animate-spin" />} Tôi đủ 18 tuổi và muốn tham gia
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="max-w-lg mx-auto">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
        <button disabled={savingPreferences} onClick={() => void savePreferences(true, !hideFace)} className="text-sm font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2">
          {hideFace ? <EyeOff className="w-4 h-4 text-violet-600" /> : <Eye className="w-4 h-4 text-violet-600" />}
          Ảnh của bạn: {hideFace ? 'đang ẩn' : 'đang hiện'}
        </button>
        <button disabled={savingPreferences} onClick={() => void savePreferences(false, hideFace)} className="text-xs font-bold text-rose-600">Tạm ẩn hồ sơ</button>
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <p className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Bạn muốn tìm</p>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Lọc giới tính hẹn hò">
          {([
            ['any', 'Tất cả'],
            ['male', 'Nam'],
            ['female', 'Nữ'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={genderFilter === value}
              onClick={() => changeGenderFilter(value)}
              className={`min-h-11 rounded-xl text-sm font-bold transition-colors ${
                genderFilter === value
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-[520px] rounded-[2rem] bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : !currentCandidate ? (
        <div className="rounded-[2rem] border border-dashed border-rose-300 dark:border-rose-800 p-10 text-center bg-rose-50/50 dark:bg-rose-950/20">
          <Heart className="w-12 h-12 mx-auto text-rose-400" />
          <h2 className="mt-3 font-black text-xl text-slate-900 dark:text-white">Sẵn sàng khám phá?</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Tìm các hồ sơ hẹn hò 18+ đã chủ động tham gia.</p>
          <button onClick={onFindProfiles} className="mt-5 px-5 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-violet-600 text-white font-black">Tìm hồ sơ phù hợp</button>
        </div>
      ) : (
        <>
          <AnimatePresence mode="wait">
            <motion.article
              key={currentCandidate.uid}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 120) void decide('like');
                if (info.offset.x < -120) void decide('pass');
              }}
              initial={{ opacity: 0, scale: .96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, x: 120, rotate: 5 }}
              className="relative h-[520px] overflow-hidden rounded-[2.25rem] bg-slate-900 shadow-2xl border border-white/10 cursor-grab active:cursor-grabbing"
            >
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setReportedProfile(currentCandidate);
                }}
                className="absolute z-20 top-4 right-4 px-3 py-2 rounded-xl bg-slate-950/45 hover:bg-slate-950/70 text-white text-xs font-bold inline-flex items-center gap-1.5 backdrop-blur-sm"
              >
                <AlertTriangle className="w-4 h-4" /> Báo cáo
              </button>
              {currentCandidate.hideFaceInDating ? (
                <div className="absolute inset-0 bg-gradient-to-br from-violet-700 via-fuchsia-700 to-slate-950 flex items-center justify-center">
                  <div className="text-center text-white"><div className="w-28 h-28 rounded-[2rem] mx-auto bg-white/10 border border-white/20 flex items-center justify-center text-3xl font-black">{initials(currentCandidate.fullName)}</div><p className="mt-4 inline-flex items-center gap-2 text-sm font-bold"><Lock className="w-4 h-4" /> Người này chọn ẩn ảnh</p></div>
                </div>
              ) : currentCandidate.photoURL ? (
                <img src={currentCandidate.photoURL} alt={`Ảnh hồ sơ của ${currentCandidate.fullName}`} className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-rose-400 to-violet-700 flex items-center justify-center"><UserIcon className="w-28 h-28 text-white/70" /></div>
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                <div className="flex items-end justify-between gap-3"><div><h2 className="text-3xl font-black">{currentCandidate.fullName}{currentCandidate.age ? `, ${currentCandidate.age}` : ''}</h2><p className="mt-1 font-bold text-rose-200 inline-flex items-center gap-1.5"><GraduationCap className="w-4 h-4" /> {currentCandidate.major || 'Sinh viên TVU'}</p></div>{currentCandidate.hideFaceInDating && <EyeOff className="w-6 h-6 text-violet-200" />}</div>
                {currentCandidate.description && <p className="mt-4 text-sm text-slate-200 leading-relaxed line-clamp-3">{currentCandidate.description}</p>}
                {currentCandidate.interests?.length ? <div className="mt-4 flex flex-wrap gap-2">{currentCandidate.interests.slice(0, 4).map((interest) => <span key={interest} className="px-2.5 py-1 rounded-full bg-white/15 text-xs font-bold">{interest}</span>)}</div> : null}
              </div>
            </motion.article>
          </AnimatePresence>

          <div className="mt-5 flex items-center justify-center gap-5">
            <button disabled={deciding} onClick={() => void decide('pass')} className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 shadow-lg flex items-center justify-center disabled:opacity-50" aria-label="Bỏ qua"><X className="w-7 h-7" /></button>
            <button disabled={deciding} onClick={() => void decide('like')} className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-xl flex items-center justify-center disabled:opacity-50" aria-label="Thích">{deciding ? <Loader2 className="w-7 h-7 animate-spin" /> : <Heart className="w-8 h-8 fill-current" />}</button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">Vuốt trái để bỏ qua · vuốt phải để thích</p>
        </>
      )}

      {matchedProfile && (
        <div className="fixed inset-0 z-[220] bg-slate-950/80 p-4 flex items-center justify-center">
          <div className="w-full max-w-sm rounded-[2rem] bg-white dark:bg-slate-900 p-7 text-center shadow-2xl">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-rose-500 to-violet-600 text-white flex items-center justify-center"><Heart className="w-10 h-10 fill-current" /></div>
            <h2 className="mt-4 text-2xl font-black text-slate-900 dark:text-white">Hai bạn cùng thích nhau!</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Bắt đầu bằng một lời chào lịch sự với {matchedProfile.fullName}.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={() => { const profile = matchedProfile; setMatchedProfile(null); onStartCall(profile); }} className="min-h-12 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-black inline-flex items-center justify-center gap-2 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><Phone className="w-5 h-5" /> Gọi thoại</button>
              <button onClick={() => onStartChat(matchedProfile.uid)} className="min-h-12 rounded-xl bg-gradient-to-r from-rose-500 to-violet-600 text-white font-black inline-flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5" /> Nhắn tin</button>
            </div>
            <button onClick={() => setMatchedProfile(null)} className="mt-3 text-sm font-bold text-slate-500">Tiếp tục xem</button>
          </div>
        </div>
      )}

      {reportedProfile && (
        <ReportModal
          isOpen
          onClose={() => setReportedProfile(null)}
          reporterUid={currentUser.uid}
          reportedUid={reportedProfile.uid}
          reportedName={reportedProfile.fullName}
        />
      )}
    </section>
  );
};
