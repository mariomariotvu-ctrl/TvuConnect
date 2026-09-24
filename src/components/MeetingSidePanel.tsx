import React from 'react';
import {
  CameraOff,
  Hand,
  Lock,
  MicOff,
  ScreenShareOff,
  ShieldCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { StudyRoom, StudyRoomParticipant } from '../types/socialAudio';
import { StudyRoomControl } from '../services/studyRoomService';

type MeetingPanel = 'people' | 'controls';

interface MeetingSidePanelProps {
  panel: MeetingPanel;
  room: StudyRoom;
  participants: StudyRoomParticipant[];
  currentUserUid: string;
  busyParticipantUid: string | null;
  onClose: () => void;
  onMuteParticipant: (participant: StudyRoomParticipant) => void;
  onRemoveParticipant: (participant: StudyRoomParticipant) => void;
  onToggleControl: (control: StudyRoomControl, enabled: boolean) => void;
}

const ControlToggle: React.FC<{
  checked: boolean;
  icon: React.ReactNode;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, icon, label, description, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
    aria-pressed={checked}
  >
    <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${checked ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-black text-white">{label}</span>
      <span className="mt-0.5 block text-xs text-slate-400">{description}</span>
    </span>
    <span className={`relative h-6 w-11 flex-none rounded-full transition ${checked ? 'bg-rose-500' : 'bg-slate-700'}`}>
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} />
    </span>
  </button>
);

export const MeetingSidePanel: React.FC<MeetingSidePanelProps> = ({
  panel,
  room,
  participants,
  currentUserUid,
  busyParticipantUid,
  onClose,
  onMuteParticipant,
  onRemoveParticipant,
  onToggleControl,
}) => {
  const isOwner = room.ownerUid === currentUserUid;
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.handRaised === b.handRaised) return a.displayName.localeCompare(b.displayName, 'vi');
    return a.handRaised ? -1 : 1;
  });

  return (
    <aside className="fixed inset-y-0 right-0 z-[220] flex w-full flex-col border-l border-white/10 bg-slate-950/95 text-white shadow-2xl backdrop-blur-xl sm:w-[23rem]" aria-label={panel === 'people' ? 'Danh sách người tham gia' : 'Quyền chủ phòng'}>
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-4">
        <div>
          <p className="text-base font-black">{panel === 'people' ? 'Người tham gia' : 'Quyền chủ phòng'}</p>
          <p className="mt-0.5 text-xs text-slate-400">{participants.length}/{room.maxParticipants} người trong phòng</p>
        </div>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2.5 hover:bg-white/20" aria-label="Đóng bảng"><X className="h-5 w-5" /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {panel === 'people' ? (
          <div className="space-y-2">
            {sortedParticipants.map((participant) => {
              const self = participant.uid === currentUserUid;
              const owner = participant.uid === room.ownerUid;
              return (
                <div key={participant.uid} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="h-11 w-11 flex-none overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-center font-black leading-[2.75rem]">
                    {participant.photoURL ? <img src={participant.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : participant.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-black">{self ? 'Bạn' : participant.displayName}</p>
                      {owner && <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[9px] font-black text-indigo-200">CHỦ PHÒNG</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <span className={participant.muted ? 'text-rose-300' : 'text-emerald-300'}>{participant.muted ? 'Mic tắt' : 'Mic bật'}</span>
                      {participant.cameraOn && <span>Camera bật</span>}
                      {participant.sharingScreen && <span className="text-sky-300">Đang trình chiếu</span>}
                    </div>
                  </div>
                  {participant.handRaised && <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-amber-400/20 text-amber-300" title="Đang giơ tay"><Hand className="h-5 w-5" /></span>}
                  {isOwner && !self && (
                    <div className="flex flex-none items-center gap-1">
                      <button onClick={() => onMuteParticipant(participant)} className="rounded-full p-2 text-slate-300 hover:bg-white/10" aria-label={`Tắt micro ${participant.displayName}`}><MicOff className="h-4 w-4" /></button>
                      <button disabled={busyParticipantUid === participant.uid} onClick={() => onRemoveParticipant(participant)} className="rounded-full p-2 text-rose-300 hover:bg-rose-500/15 disabled:opacity-40" aria-label={`Mời ${participant.displayName} rời phòng`}><UserMinus className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : isOwner ? (
          <div className="space-y-3">
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-3 text-xs text-indigo-100">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" />
              Các khóa áp dụng tức thì cho thành viên, nhưng không khóa micro/camera của chủ phòng.
            </div>
            <ControlToggle checked={Boolean(room.roomLocked)} icon={<Lock className="h-5 w-5" />} label="Khóa phòng" description="Không nhận thêm người mới." onChange={(enabled) => onToggleControl('roomLocked', enabled)} />
            <ControlToggle checked={Boolean(room.audioLocked)} icon={<MicOff className="h-5 w-5" />} label="Khóa micro thành viên" description="Tắt tiếng mọi người và không cho tự bật lại." onChange={(enabled) => onToggleControl('audioLocked', enabled)} />
            <ControlToggle checked={Boolean(room.videoLocked)} icon={<CameraOff className="h-5 w-5" />} label="Khóa camera thành viên" description="Dừng camera người tham gia để tập trung hoặc tiết kiệm mạng." onChange={(enabled) => onToggleControl('videoLocked', enabled)} />
            <ControlToggle checked={Boolean(room.screenShareLocked)} icon={<ScreenShareOff className="h-5 w-5" />} label="Chỉ chủ phòng được chia sẻ" description="Ngăn thành viên bắt đầu trình chiếu màn hình." onChange={(enabled) => onToggleControl('screenShareLocked', enabled)} />
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-slate-400"><Users className="mx-auto mb-3 h-8 w-8" />Chỉ chủ phòng mới xem và thay đổi các quyền này.</div>
        )}
      </div>
    </aside>
  );
};
