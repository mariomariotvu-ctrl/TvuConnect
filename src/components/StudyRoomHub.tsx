import React, { useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { BookOpen, Headphones, Loader2, Plus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { StudentProfile } from '../types';
import { StudyRoom } from '../types/socialAudio';
import { createStudyRoom, subscribeToStudyRooms } from '../services/studyRoomService';
import { GroupStudyCall } from './GroupStudyCall';
import { getStudyRoomErrorMessage } from '../utils/userFacingErrors';

interface StudyRoomHubProps {
  currentUser: User;
  currentProfile: StudentProfile | null;
}

export const StudyRoomHub: React.FC<StudyRoomHubProps> = ({ currentUser, currentProfile }) => {
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [activeRoom, setActiveRoom] = useState<StudyRoom | null>(null);
  const closeActiveRoom = useCallback(() => setActiveRoom(null), []);

  useEffect(() => subscribeToStudyRooms((nextRooms) => {
    setRooms(nextRooms);
    setLoading(false);
  }, (error) => {
    console.error('Could not load study rooms:', error);
    setLoading(false);
    toast.error(getStudyRoomErrorMessage(error));
  }), []);

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentProfile) return;
    if (title.trim().length < 3) {
      toast.error('Tên phòng cần ít nhất 3 ký tự.');
      return;
    }
    setCreating(true);
    try {
      const room = await createStudyRoom(currentProfile, title, subject);
      setShowCreate(false);
      setTitle('');
      setSubject('');
      setActiveRoom(room);
    } catch (error) {
      console.error('Could not create study room:', error);
      toast.error(getStudyRoomErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="mb-7 rounded-[2rem] border border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/30 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg"><Headphones className="w-6 h-6" /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Học cùng nhau</p>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">Phòng học thoại nhóm</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Tối đa 8 người, không có bộ đếm tự ngắt thời gian.</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} disabled={!currentProfile} className="min-h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black inline-flex items-center justify-center gap-2 disabled:opacity-50">
          <Plus className="w-4 h-4" /> Tạo phòng
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {loading ? (
          <div className="sm:col-span-2 py-8 text-center"><Loader2 className="w-7 h-7 mx-auto animate-spin text-indigo-500" /></div>
        ) : rooms.length === 0 ? (
          <div className="sm:col-span-2 rounded-2xl border border-dashed border-indigo-300 dark:border-indigo-700 p-6 text-center text-sm text-slate-600 dark:text-slate-300">
            Chưa có phòng đang mở. Hãy tạo phòng đầu tiên cho môn bạn đang học.
          </div>
        ) : rooms.map((room) => (
          <article key={room.id} className="rounded-2xl bg-white dark:bg-slate-900/70 border border-indigo-100 dark:border-indigo-800 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center"><BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-300" /></div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-slate-900 dark:text-white truncate">{room.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{room.subject || 'Học chung'}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-300 inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {room.participantCount}/{room.maxParticipants} người</span>
              <button onClick={() => setActiveRoom(room)} disabled={!currentProfile || room.participantCount >= room.maxParticipants} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black disabled:opacity-50">{room.participantCount >= room.maxParticipants ? 'Đã đầy' : 'Vào phòng'}</button>
            </div>
          </article>
        ))}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-[205] bg-slate-950/70 p-4 flex items-center justify-center" onClick={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
          <form onSubmit={createRoom} className="w-full max-w-md rounded-[2rem] bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="text-xl font-black text-slate-900 dark:text-white">Tạo phòng học</h2><button type="button" onClick={() => setShowCreate(false)} className="p-2 text-slate-400"><X className="w-5 h-5" /></button></div>
            <label className="block mt-5 text-sm font-bold text-slate-700 dark:text-slate-200">Tên phòng
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Ví dụ: Ôn thi Cấu trúc dữ liệu" className="mt-1.5 w-full min-h-12 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white" />
            </label>
            <label className="block mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">Môn/chủ đề
              <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={80} placeholder="Tên môn hoặc mục tiêu buổi học" className="mt-1.5 w-full min-h-12 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white" />
            </label>
            <button type="submit" disabled={creating} className="mt-6 w-full min-h-12 rounded-xl bg-indigo-600 text-white font-black disabled:opacity-60 inline-flex items-center justify-center gap-2">{creating && <Loader2 className="w-4 h-4 animate-spin" />} Tạo và vào phòng</button>
          </form>
        </div>
      )}

      {activeRoom && currentProfile && (
        <GroupStudyCall room={activeRoom} currentUser={currentUser} onClose={closeActiveRoom} />
      )}
    </section>
  );
};
