import React, { useState, useEffect, memo } from 'react';
import { StudentProfile } from '../types';
import { User, Phone, BookOpen, GraduationCap, Heart, Calendar, FileText, Mail, MapPin, AlertTriangle, ShieldOff, Check, Loader2, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, doc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc, handleFirestoreError, OperationType } from '../firebase';
import { ReportModal } from './ReportModal';
import { ConfirmModal } from './ConfirmModal';
import { OnlineStatus } from './OnlineStatus';

interface ProfileCardProps {
  profile: StudentProfile;
  onRematch?: () => void;
  onStartChat?: (uid: string) => void;
  showActions?: boolean;
}

export const ProfileCard: React.FC<ProfileCardProps> = memo(({ profile, onRematch, onStartChat, showActions = true }) => {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isConfirmBlockOpen, setIsConfirmBlockOpen] = useState(false);

  const isMe = auth.currentUser?.uid === profile.uid;

  useEffect(() => {
    if (!auth.currentUser || isMe) return;

    const checkSaved = async () => {
      try {
        const qSaved = query(
          collection(db, 'favorites'),
          where('fromUid', '==', auth.currentUser!.uid),
          where('toUid', '==', profile.uid)
        );
        const savedSnap = await getDocs(qSaved);
        setIsSaved(!savedSnap.empty);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'favorites');
      }
    };

    checkSaved();
  }, [profile.uid, isMe]);

  const handleSaveProfile = async () => {
    if (!auth.currentUser) return;
    setIsSaving(true);
    try {
      const favoriteId = `${auth.currentUser.uid}_${profile.uid}`;
      if (isSaved) {
        await deleteDoc(doc(db, 'favorites', favoriteId));
        setIsSaved(false);
      } else {
        await setDoc(doc(db, 'favorites', favoriteId), {
          fromUid: auth.currentUser.uid,
          toUid: profile.uid,
          createdAt: serverTimestamp()
        });
        setIsSaved(true);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'favorites');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBlock = async () => {
    if (!auth.currentUser) return;

    setIsBlocking(true);
    try {
      const blockId = `${auth.currentUser.uid}_${profile.uid}`;
      await setDoc(doc(db, 'blocks', blockId), {
        blockerUid: auth.currentUser.uid,
        blockedUid: profile.uid,
        createdAt: serverTimestamp()
      });
      setIsBlocked(true);
      if (onRematch) {
        setTimeout(onRematch, 1500);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'blocks');
    } finally {
      setIsBlocking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-md md:max-w-xl mx-auto bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 relative"
    >
      <div className="relative h-48 bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600">
        {showActions && auth.currentUser && !isMe && (
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className={`p-2 backdrop-blur-md transition-all rounded-full ${isSaved ? 'bg-yellow-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
              title={isSaved ? "Bỏ lưu" : "Lưu hồ sơ"}
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />}
            </button>
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="p-2 bg-white/20 backdrop-blur-md hover:bg-white/30 text-white rounded-full transition-all"
              title="Báo cáo"
            >
              <AlertTriangle className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsConfirmBlockOpen(true)}
              disabled={isBlocking || isBlocked}
              className={`p-2 bg-white/20 backdrop-blur-md hover:bg-white/30 text-white rounded-full transition-all ${isBlocked ? 'bg-red-500/50' : ''
                }`}
              title="Chặn"
            >
              {isBlocking ? <Loader2 className="w-5 h-5 animate-spin" /> : isBlocked ? <Check className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
            </button>
          </div>
        )}
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2">
          <div className="p-1.5 bg-white rounded-full shadow-lg">
            {profile.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.fullName}
                className="w-32 h-32 rounded-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.fullName || 'U')}&background=8b5cf6&color=fff&size=128`;
                }}
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center">
                <User className="w-16 h-16 text-gray-300" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pt-16 md:pt-20 pb-8 px-6 md:px-8 text-center">
        <div className="flex flex-col items-center justify-center gap-1">
          <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {profile.fullName}
          </h3>
          {profile.nickname && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">"{profile.nickname}"</p>
          )}
          <div className="flex justify-center mt-1">
            <OnlineStatus userId={profile.uid} size="sm" showText={true} />
          </div>
        </div>
        <p className="heading-gradient-text font-medium mt-1 text-sm md:text-base">{profile.major || 'Chưa cập nhật ngành'}</p>

        <div className="flex justify-center gap-2 mt-4">
          <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-full uppercase tracking-wider">
            {profile.gender === 'male' ? 'Nam' : profile.gender === 'female' ? 'Nữ' : 'Khác'}
          </span>
          <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-full uppercase tracking-wider">
            {profile.academicYear || 'Khóa ?'}
          </span>
        </div>

        {/* Info Grid — 2 cột trên desktop */}
        <div className="mt-6 md:mt-8 grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
          {/* Email — full width vì thường dài */}
          <div className="md:col-span-2 flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl px-4 py-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-xl shrink-0">
              <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Email</p>
              <p className="text-sm text-gray-700 dark:text-gray-200 font-medium truncate">{profile.email}</p>
            </div>
          </div>

          {(isMe || profile.showPhone !== false) && profile.phone && (
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl px-4 py-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-xl shrink-0">
                <Phone className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Điện thoại</p>
                <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">{profile.phone}</p>
              </div>
            </div>
          )}

          {(isMe || profile.showHometown !== false) && profile.hometown && (
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl px-4 py-3">
              <div className="p-2 bg-sky-100 dark:bg-sky-900/40 rounded-xl shrink-0">
                <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Quê quán</p>
                <p className="text-sm text-gray-700 dark:text-gray-200 font-medium truncate">{profile.hometown}</p>
              </div>
            </div>
          )}

          {profile.className && (
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-2xl px-4 py-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-xl shrink-0">
                <GraduationCap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Lớp</p>
                <p className="text-sm text-gray-700 dark:text-gray-200 font-medium">{profile.className}</p>
              </div>
            </div>
          )}

          {profile.purpose && (
            <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-900/20 rounded-2xl px-4 py-3 md:col-span-2">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-xl shrink-0">
                <Heart className="w-4 h-4 text-orange-500 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Mục đích</p>
                <p className="text-sm text-orange-700 dark:text-orange-300 font-semibold">{profile.purpose}</p>
              </div>
            </div>
          )}
        </div>

        {/* Study Goals */}
        {profile.studyGoals && profile.studyGoals.length > 0 && (
          <div className="mt-4 text-left bg-blue-50 dark:bg-blue-900/20 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Mục tiêu học tập</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {profile.studyGoals.map(goal => (
                <span key={goal} className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-xl">
                  {goal}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Interests */}
        {profile.interests && profile.interests.length > 0 && (
          <div className="mt-4 text-left">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider px-2">Sở thích</p>
              <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <span key={interest} className="px-3 py-1 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/30 dark:to-indigo-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium rounded-xl border border-violet-100 dark:border-violet-800/40">
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {profile.description && (
          <div className="mt-4 text-left">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider px-2">Về bản thân</p>
              <div className="h-px flex-1 bg-gray-100 dark:bg-gray-700" />
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-2xl px-4 py-3">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic line-clamp-4 md:line-clamp-none">
                "{profile.description}"
              </p>
            </div>
          </div>
        )}

        {isBlocked && (
          <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold animate-pulse">
            Đã chặn người dùng này. Đang ghép cặp lại...
          </div>
        )}

        {showActions && auth.currentUser && !isMe && !isBlocked && (
          <div className="mt-10 space-y-3">
            <button
              onClick={() => onStartChat?.(profile.uid)}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 dark:from-indigo-700 dark:via-violet-700 dark:to-blue-600 text-white font-bold rounded-2xl hover:opacity-90 transition-all shadow-lg dark:shadow-indigo-500/50 flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-5 h-5" />
              Nhắn tin ngay
            </button>
          </div>
        )}

        {onRematch && !isBlocked && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsConfirmBlockOpen(true)}
              className="py-3.5 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 transition-all flex items-center justify-center gap-2 text-sm active:scale-95"
            >
              <ShieldOff className="w-4 h-4" />
              Chặn
            </button>
            <button
              onClick={onRematch}
              className="py-3.5 bg-gray-100 text-gray-700 font-bold rounded-2xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2 text-sm active:scale-95"
            >
              <Check className="w-4 h-4" />
              Bỏ qua
            </button>
          </div>
        )}
      </div>

      {auth.currentUser && (
        <>
          <ReportModal
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            reporterUid={auth.currentUser.uid}
            reportedUid={profile.uid}
            reportedName={profile.fullName}
          />
          <ConfirmModal
            isOpen={isConfirmBlockOpen}
            onClose={() => setIsConfirmBlockOpen(false)}
            onConfirm={handleBlock}
            title="Chặn người dùng"
            message={`Bạn có chắc chắn muốn chặn ${profile.fullName}? Bạn sẽ không gặp lại người này nữa và cuộc trò chuyện (nếu có) sẽ bị ẩn.`}
            confirmText="Chặn ngay"
          />
        </>
      )}
    </motion.div>
  );
});

