import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { getRuntimeConfig, initializeRuntimeConfig, subscribeRuntimeConfig } from '../config/runtimeConfig';
import { claimCommunityAnnouncement, isAnnouncementId } from '../services/communityAnnouncementService';
import { logger } from '../utils/logger';

interface Announcement {
  key: string;
  title: string;
  body: string;
}

export function CommunityAnnouncementCard({ title, body, onClose }: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <section aria-label="Lời nhắn từ TVU Connect" className="relative w-full rounded-2xl border border-violet-200 bg-white p-5 pr-12 text-slate-900 shadow-xl dark:border-violet-800 dark:bg-slate-900 dark:text-slate-100">
      <button type="button" aria-label="Đóng thông báo cộng đồng" onClick={onClose} className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600 dark:hover:bg-slate-800">
        <X size={18} aria-hidden="true" />
      </button>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">TVU Connect · Lời nhắn cộng đồng</p>
      <h2 className="text-base font-bold leading-6">{title}</h2>
      <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{body}</p>
    </section>
  );
}

/** Kept mounted while a call/tour is open, so an in-flight receipt can wait. */
export function CommunityAnnouncement({ uid, paused }: { uid: string; paused: boolean }) {
  const [config, setConfig] = useState(getRuntimeConfig);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<Announcement | null>(null);
  const [finishedKey, setFinishedKey] = useState('');
  const busy = useRef(false);
  const presented = useRef(new Set<string>());
  const mounted = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announcementId = config.communityAnnouncementId;
  const key = `${uid}:${announcementId}`;
  const toastId = `community:${key}`;
  const eligible = ready && !paused && visible && online
    && config.communityAnnouncementEnabled && isAnnouncementId(announcementId)
    && Boolean(config.communityAnnouncementTitle && config.communityAnnouncementBody);
  const latest = useRef({ eligible, key });
  latest.current = { eligible, key };

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeRuntimeConfig(setConfig);
    void initializeRuntimeConfig().then(() => { if (mounted.current) setReady(true); });
    const visibility = () => setVisible(document.visibilityState === 'visible');
    const connectivity = () => setOnline(navigator.onLine);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    return () => {
      mounted.current = false;
      unsubscribe();
      clearTimeout(retryTimer.current);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
    };
  }, []);

  useEffect(() => {
    if (!eligible || pending?.key === key || finishedKey === key) return;
    const timer = setTimeout(async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const result = await claimCommunityAnnouncement(uid, announcementId,
          () => mounted.current && latest.current.eligible && latest.current.key === key);
        if (!mounted.current) return;
        if (result === 'claimed') {
          // Do not discard a successful claim when a call starts during the
          // network request: queue the card until this account can see it.
          setPending({ key, title: config.communityAnnouncementTitle, body: config.communityAnnouncementBody });
        } else if (result === 'seen') setFinishedKey(key);
      } catch (error) {
        logger.warn('Community announcement deferred:', error);
      } finally {
        busy.current = false;
        // Bounded frequency; never fail login or show error toasts for a notice.
        if (mounted.current) retryTimer.current = setTimeout(() => setAttempt(value => value + 1), 60_000);
      }
    }, 4_000);
    return () => clearTimeout(timer);
  }, [uid, announcementId, key, eligible, pending?.key, finishedKey, attempt,
    config.communityAnnouncementTitle, config.communityAnnouncementBody]);

  useEffect(() => {
    if (!eligible) { toast.dismiss(toastId); return; }
    if (!pending || pending.key !== key || presented.current.has(key)) return;
    presented.current.add(key);
    toast.custom(() => (
      <CommunityAnnouncementCard title={pending.title} body={pending.body} onClose={() => toast.dismiss(toastId)} />
    ), { id: toastId, duration: 20_000, closeButton: false });
  }, [eligible, pending, key, toastId]);

  useEffect(() => () => { toast.dismiss(toastId); }, [toastId]);
  return null;
}
