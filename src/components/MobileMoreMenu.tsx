import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  BookOpen,
  Download,
  FileText,
  GraduationCap,
  Heart,
  Home,
  LogOut,
  Settings,
  Smile,
  Sparkles,
  User,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { View } from '../types';
import type { ExploreTab, MatchingMode } from '../routes/appRoutes';
import { ThemeToggle } from './ThemeToggle';
import { isStandaloneApp, requestAppInstall } from '../utils/platform';

interface MobileMoreMenuProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onOpenExplore: (tab: ExploreTab) => void;
  onOpenMatching: (mode: MatchingMode) => void;
  onLogout: () => void;
}

interface MenuItemProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'orange' | 'rose' | 'violet' | 'indigo' | 'emerald' | 'slate';
  onClick: () => void;
}

const toneClasses = {
  orange: 'border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-800/40 dark:bg-orange-950/30 dark:text-orange-300',
  rose: 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-300',
  violet: 'border-violet-100 bg-violet-50 text-violet-600 dark:border-violet-800/40 dark:bg-violet-950/30 dark:text-violet-300',
  indigo: 'border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-800/40 dark:bg-indigo-950/30 dark:text-indigo-300',
  emerald: 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300',
  slate: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const MenuItem: React.FC<MenuItemProps> = ({ title, description, icon: Icon, tone = 'slate', onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex h-full min-h-[5.25rem] w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${toneClasses[tone]}`}
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm dark:bg-slate-950/55">
      <Icon className="h-5 w-5" />
    </span>
    <span className="min-w-0 pt-0.5">
      <span className="block text-sm font-extrabold text-slate-950 dark:text-white">{title}</span>
      <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">{description}</span>
    </span>
  </button>
);

const MenuSection: React.FC<React.PropsWithChildren<{ id: string; title: string; hint: string }>> = ({ id, title, hint, children }) => (
  <section aria-labelledby={id} className="space-y-2.5">
    <div className="px-1">
      <h3 id={id} className="text-sm font-extrabold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  </section>
);

export const MobileMoreMenu: React.FC<MobileMoreMenuProps> = ({
  open,
  onClose,
  onNavigate,
  onOpenExplore,
  onOpenMatching,
  onLogout,
}) => {
  const standalone = isStandaloneApp();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  const navigate = (view: View) => {
    onClose();
    onNavigate(view);
  };
  const openExplore = (tab: ExploreTab) => {
    onClose();
    onOpenExplore(tab);
  };
  const openMatching = (mode: MatchingMode) => {
    onClose();
    onOpenMatching(mode);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center p-3 pb-[calc(4.8rem+var(--sab))] xl:items-center xl:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đóng danh sách tiện ích"
            className="absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.section
            id="utility-menu-container"
            role="dialog"
            aria-modal="true"
            aria-labelledby="utility-menu-title"
            initial={{ y: 24, opacity: 0.75, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="relative z-10 max-h-[min(78dvh,48rem)] w-full max-w-4xl overflow-y-auto overscroll-contain rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-5"
          >
            <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-5 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:-top-5 sm:-mx-5 sm:-mt-5 sm:px-6 sm:py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">TVU Connect</p>
                <h2 id="utility-menu-title" className="mt-0.5 text-xl font-black text-slate-950 dark:text-white">Tất cả tiện ích</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Chọn theo việc bạn muốn làm, không cần nhớ tính năng nằm ở đâu.</p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              <MenuSection id="connect-tools-title" title="Kết nối" hint="Ghép đôi, trò chuyện và xem hoạt động cộng đồng">
                <MenuItem title="Gọi nhanh 1–1" description="Ghép người đang rảnh để trò chuyện" icon={Zap} tone="indigo" onClick={() => openMatching('quick')} />
                <MenuItem title="Hẹn hò" description="Khám phá hồ sơ đã chủ động tham gia" icon={Heart} tone="rose" onClick={() => openMatching('lover')} />
                <MenuItem title="Cùng sở thích" description="Kết nối theo mối quan tâm chung" icon={Smile} tone="orange" onClick={() => openMatching('hobby')} />
                <MenuItem title="Cộng đồng" description="Bài viết và hoạt động sinh viên" icon={FileText} onClick={() => navigate('posts')} />
              </MenuSection>

              <MenuSection id="study-tools-title" title="Học tập" hint="Tài liệu, phòng học và trợ lý sinh viên">
                <MenuItem title="Thư viện học liệu" description="Sách, giáo trình và tài liệu theo ngành" icon={BookOpen} tone="indigo" onClick={() => navigate('documents')} />
                <MenuItem title="Phòng học nhóm" description="Họp video, chia sẻ màn hình và xem chung" icon={GraduationCap} tone="emerald" onClick={() => openMatching('study')} />
                <MenuItem title="Trợ lý học tập AI" description="Giải thích bài và tìm nguồn đọc phù hợp" icon={Sparkles} tone="violet" onClick={() => openExplore('ai')} />
              </MenuSection>

              <MenuSection id="nearby-tools-title" title="Quanh bạn" hint="Những nhu cầu thường gặp khi học và sinh hoạt">
                <MenuItem title="Ăn gì quanh đây?" description="Quán ăn gần vị trí hiện tại" icon={Utensils} tone="orange" onClick={() => openExplore('food')} />
                <MenuItem title="Tìm trọ" description="Phòng trọ, ở ghép và liên hệ nhanh" icon={Home} tone="rose" onClick={() => openExplore('rental')} />
              </MenuSection>

              <MenuSection id="account-tools-title" title="Cá nhân" hint="Thông báo, hồ sơ và tùy chọn tài khoản">
                <MenuItem title="Thông báo" description="Kết bạn, tương tác và phát hiện mới" icon={Bell} onClick={() => navigate('notifications')} />
                <MenuItem title="Hồ sơ cá nhân" description="Ảnh, sở thích và quyền riêng tư" icon={User} onClick={() => navigate('profile')} />
                <MenuItem title="Cài đặt" description="Hướng dẫn, quyền và quản lý tài khoản" icon={Settings} onClick={() => navigate('settings')} />
              </MenuSection>

              <section aria-labelledby="appearance-title" className="space-y-2.5">
                <h3 id="appearance-title" className="px-1 text-sm font-extrabold text-slate-900 dark:text-white">Ứng dụng</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {!standalone && (
                    <button
                      type="button"
                      className="flex min-h-14 items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-left text-violet-700 dark:border-violet-800/40 dark:bg-violet-950/30 dark:text-violet-300"
                      onClick={() => {
                        onClose();
                        requestAppInstall();
                      }}
                    >
                      <Download className="h-5 w-5" />
                      <span><strong className="block text-sm">Cài TVU Connect</strong><small className="text-xs opacity-75">Dùng toàn màn hình như ứng dụng</small></span>
                    </button>
                  )}
                  <div className="flex min-h-14 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Chế độ sáng / tối</span>
                    <ThemeToggle />
                  </div>
                </div>
              </section>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 py-3.5 text-sm font-bold text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
              >
                <LogOut className="h-5 w-5" />
                Đăng xuất
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
