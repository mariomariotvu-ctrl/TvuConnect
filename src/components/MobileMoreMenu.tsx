import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  BookOpen,
  Download,
  FileText,
  Home,
  LogOut,
  Settings,
  Sparkles,
  User,
  Utensils,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { View } from '../types';
import type { ExploreTab } from '../routes/appRoutes';
import { ThemeToggle } from './ThemeToggle';
import { isStandaloneApp, requestAppInstall } from '../utils/platform';

interface MobileMoreMenuProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onOpenExplore: (tab: ExploreTab) => void;
  onLogout: () => void;
}

interface MenuItemProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'orange' | 'rose' | 'violet' | 'slate';
  onClick: () => void;
}

const toneClasses = {
  orange: 'border-orange-100 bg-orange-50 text-orange-600 dark:border-orange-800/40 dark:bg-orange-950/30 dark:text-orange-300',
  rose: 'border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-300',
  violet: 'border-violet-100 bg-violet-50 text-violet-600 dark:border-violet-800/40 dark:bg-violet-950/30 dark:text-violet-300',
  slate: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const MenuItem: React.FC<MenuItemProps> = ({ title, description, icon: Icon, tone = 'slate', onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-transform active:scale-[0.98] ${toneClasses[tone]}`}
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm dark:bg-slate-950/50">
      <Icon className="h-5 w-5" />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-bold text-slate-900 dark:text-white">{title}</span>
      <span className="block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
    </span>
  </button>
);

export const MobileMoreMenu: React.FC<MobileMoreMenuProps> = ({
  open,
  onClose,
  onNavigate,
  onOpenExplore,
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

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] xl:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đóng menu Thêm"
            className="absolute inset-0 h-full w-full bg-slate-950/40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.section
            id="mobile-menu-container"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            initial={{ y: 28, opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 28, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="absolute inset-x-3 bottom-[calc(4.8rem+var(--sab))] max-h-[min(76dvh,44rem)] overflow-y-auto overscroll-contain rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">TVU Connect</p>
                <h2 id="mobile-more-title" className="mt-0.5 text-lg font-extrabold text-slate-950 dark:text-white">Thêm tiện ích</h2>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              <section aria-labelledby="student-tools-title" className="space-y-2">
                <h3 id="student-tools-title" className="px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Tiện ích sinh viên</h3>
                <MenuItem title="Tìm trọ" description="Phòng, ở ghép và liên hệ nhanh" icon={Home} tone="orange" onClick={() => openExplore('rental')} />
                <MenuItem title="Ăn gì quanh đây?" description="Quán ăn gần vị trí hiện tại" icon={Utensils} tone="rose" onClick={() => openExplore('food')} />
                <MenuItem title="Trợ lý học tập AI" description="Học tập và hướng dẫn sử dụng ứng dụng" icon={Sparkles} tone="violet" onClick={() => openExplore('ai')} />
                <MenuItem title="Cộng đồng" description="Bài viết và hoạt động sinh viên" icon={FileText} onClick={() => navigate('posts')} />
                <MenuItem title="Thư viện học liệu" description="Sách, giáo trình và tài liệu theo ngành" icon={BookOpen} onClick={() => navigate('documents')} />
                <MenuItem title="Thông báo" description="Tin nhắn, cuộc gọi và kết nối mới" icon={Bell} onClick={() => navigate('notifications')} />
                <MenuItem title="Hồ sơ cá nhân" description="Thông tin, quyền riêng tư và vị trí" icon={User} onClick={() => navigate('profile')} />
              </section>

              <section aria-labelledby="appearance-title" className="space-y-2">
                <h3 id="appearance-title" className="px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Giao diện</h3>
                {!standalone && (
                  <MenuItem
                    title="Cài TVU Connect"
                    description="Mở toàn màn hình và dùng như một ứng dụng"
                    icon={Download}
                    tone="violet"
                    onClick={() => {
                      onClose();
                      requestAppInstall();
                    }}
                  />
                )}
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Chế độ sáng / tối</span>
                  <ThemeToggle />
                </div>
              </section>

              <section aria-labelledby="account-title" className="space-y-2">
                <h3 id="account-title" className="px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Tài khoản</h3>
                <button
                  type="button"
                  onClick={() => navigate('settings')}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 py-3.5 text-sm font-bold text-indigo-700 dark:border-indigo-800/40 dark:bg-indigo-950/30 dark:text-indigo-300"
                >
                  <Settings className="h-5 w-5" />
                  Cài đặt tài khoản
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50 py-3.5 text-sm font-bold text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                >
                  <LogOut className="h-5 w-5" />
                  Đăng xuất
                </button>
              </section>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
