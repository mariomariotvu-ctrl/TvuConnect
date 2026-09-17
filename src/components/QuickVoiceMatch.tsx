import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { BookOpen, Headphones, Loader2, Mic, PhoneCall, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../firebase';
import { StudentProfile } from '../types';
import { VoiceMatchPurpose, VoiceQueueState } from '../types/socialAudio';
import {
  joinVoiceMatchQueue,
  leaveVoiceMatchQueue,
  subscribeToVoiceQueue,
} from '../services/voiceMatchService';
import { getVoiceMatchErrorMessage } from '../utils/userFacingErrors';

interface QuickVoiceMatchProps {
  currentUser: User;
  onStartCall: (profile: StudentProfile, kind: 'audio') => void;
}

type VoiceMatchPhase = 'idle' | 'searching' | 'matched' | 'error';
const SEARCH_TIMEOUT_MS = 5 * 60 * 1000;

export const QuickVoiceMatch: React.FC<QuickVoiceMatchProps> = ({ currentUser, onStartCall }) => {
  const [purpose, setPurpose] = useState<VoiceMatchPurpose>('casual');
  const [phase, setPhase] = useState<VoiceMatchPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const handledSessionRef = useRef<string | null>(null);
  const waitingRef = useRef(false);

  const handleMatchedState = useCallback(async (queue: Partial<VoiceQueueState>) => {
    if (!queue.sessionId || !queue.peerUid || handledSessionRef.current === queue.sessionId) return;
    handledSessionRef.current = queue.sessionId;
    waitingRef.current = false;
    setPhase('matched');

    try {
      if (queue.initiatorUid === currentUser.uid) {
        const peerSnapshot = await getDoc(doc(db, 'profiles', queue.peerUid));
        if (!peerSnapshot.exists()) throw new Error('Không tìm thấy hồ sơ người được ghép.');
        const peer = { ...peerSnapshot.data(), uid: queue.peerUid } as StudentProfile;
        onStartCall(peer, 'audio');
      }
      await leaveVoiceMatchQueue(currentUser.uid).catch(() => undefined);
    } catch (matchError) {
      console.error('Could not open quick voice call:', matchError);
      setError(matchError instanceof Error ? matchError.message : 'Không thể mở cuộc gọi.');
      setPhase('error');
    }
  }, [currentUser.uid, onStartCall]);

  useEffect(() => {
    if (phase !== 'searching') return;

    const unsubscribe = subscribeToVoiceQueue(currentUser.uid, (queue) => {
      if (queue?.status === 'matched') void handleMatchedState(queue);
    }, (listenerError) => {
      console.error('Voice queue listener failed:', listenerError);
      setError('Mất kết nối với hàng chờ. Hãy thử lại.');
      setPhase('error');
    });

    const timeout = window.setTimeout(() => {
      waitingRef.current = false;
      void leaveVoiceMatchQueue(currentUser.uid).catch(() => undefined);
      setError('Chưa tìm thấy người đang chờ. Hãy thử lại sau ít phút.');
      setPhase('error');
    }, SEARCH_TIMEOUT_MS);

    return () => {
      unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [currentUser.uid, handleMatchedState, phase]);

  useEffect(() => () => {
    if (waitingRef.current) void leaveVoiceMatchQueue(currentUser.uid).catch(() => undefined);
  }, [currentUser.uid]);

  const startSearching = async () => {
    setError(null);
    setPhase('searching');
    waitingRef.current = true;
    handledSessionRef.current = null;

    try {
      const result = await joinVoiceMatchQueue(purpose);
      if (result.status === 'matched') await handleMatchedState(result);
    } catch (queueError) {
      waitingRef.current = false;
      setPhase('error');
      setError(getVoiceMatchErrorMessage(queueError));
      console.error('Could not join voice queue:', queueError);
    }
  };

  const cancelSearching = async () => {
    waitingRef.current = false;
    await leaveVoiceMatchQueue(currentUser.uid).catch(() => undefined);
    setPhase('idle');
    setError(null);
    toast.info('Đã rời hàng chờ trò chuyện.');
  };

  const reset = () => {
    handledSessionRef.current = null;
    setPhase('idle');
    setError(null);
  };

  return (
    <section className="max-w-2xl mx-auto">
      <div className="rounded-[2rem] overflow-hidden border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 shadow-xl">
        <div className="relative p-6 sm:p-8 text-white bg-gradient-to-br from-indigo-700 via-violet-700 to-slate-950">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_white,_transparent_40%)]" />
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center mb-5">
              <Headphones className="w-7 h-7" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-200">Kết nối bằng giọng nói</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-black tracking-tight">Nói chuyện trước, nhắn tin sau</h1>
            <p className="mt-3 max-w-xl text-sm sm:text-base text-indigo-100 leading-relaxed">
              Ghép với một sinh viên đang chờ và bắt đầu cuộc gọi thoại ngay. Không tự tạo đoạn chat và không mở micro trước khi ghép thành công.
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={phase === 'searching'}
              onClick={() => setPurpose('casual')}
              className={`p-4 rounded-2xl border text-left transition ${purpose === 'casual' ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <Mic className="w-5 h-5 text-violet-600 dark:text-violet-300" />
              <strong className="block mt-2 text-sm text-slate-900 dark:text-white">Trò chuyện thoải mái</strong>
              <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">Làm quen, chia sẻ và luyện giao tiếp</span>
            </button>
            <button
              type="button"
              disabled={phase === 'searching'}
              onClick={() => setPurpose('study')}
              className={`p-4 rounded-2xl border text-left transition ${purpose === 'study' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
              <strong className="block mt-2 text-sm text-slate-900 dark:text-white">Học cùng 1–1</strong>
              <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">Trao đổi bài và duy trì động lực</span>
            </button>
          </div>

          {phase === 'searching' ? (
            <div className="mt-6 rounded-2xl p-5 bg-slate-950 text-white text-center">
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-violet-300" />
              <p className="mt-3 font-black">Đang tìm người phù hợp…</p>
              <p className="mt-1 text-xs text-slate-400">Giữ màn hình này mở. Bạn có thể rời hàng chờ bất cứ lúc nào.</p>
              <button onClick={() => void cancelSearching()} className="mt-4 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold inline-flex items-center gap-2">
                <X className="w-4 h-4" /> Hủy tìm
              </button>
            </div>
          ) : phase === 'matched' ? (
            <div className="mt-6 rounded-2xl p-5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center">
              <PhoneCall className="w-8 h-8 mx-auto text-emerald-600" />
              <p className="mt-2 font-black text-emerald-800 dark:text-emerald-200">Đã ghép thành công</p>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Cuộc gọi đang được mở. Nếu người kia chưa nhận, hãy chờ trong giây lát.</p>
              <button onClick={reset} className="mt-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">Tìm cuộc trò chuyện khác</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void startSearching()}
              className="mt-6 w-full min-h-14 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white font-black shadow-lg hover:opacity-95 active:scale-[.99] inline-flex items-center justify-center gap-2"
            >
              <PhoneCall className="w-5 h-5" /> Ghép cuộc gọi ngay
            </button>
          )}

          {error && <p className="mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>}

          <div className="mt-5 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <p>Không ghép với người đã chặn bạn hoặc bị bạn chặn. Bạn có thể kết thúc cuộc gọi ngay lập tức và báo cáo khi cần.</p>
          </div>
        </div>
      </div>
    </section>
  );
};
