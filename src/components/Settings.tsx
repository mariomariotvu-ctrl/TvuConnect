import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { Trash2, Shield, LogOut, Moon, Sun, HelpCircle, ShieldOff, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import { DeleteAccountModal } from './DeleteAccountModal';
import { useTheme } from '../contexts/ThemeContext';
import { areAppSoundsEnabled, playAppSound, setAppSoundsEnabled } from '../utils/appSounds';

interface SettingsProps {
  user: User;
  onLogout: () => void;
  onShowTour?: () => void;
  onShowBlockedList?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ user, onLogout, onShowTour, onShowBlockedList }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(() => areAppSoundsEnabled());
  const { theme, toggleTheme } = useTheme();

  const toggleSounds = () => {
    const enabled = !soundsEnabled;
    setAppSoundsEnabled(enabled);
    setSoundsEnabled(enabled);
    if (enabled) void playAppSound('success', { volume: 0.64, cooldownMs: 0 });
  };

  return (
    <>
      <div className="space-y-4">
        {/* Theme Toggle */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
            Giao diện
          </h3>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
          >
            <div className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <Sun className="w-5 h-5 text-amber-600" />
              )}
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Chế độ {theme === 'dark' ? 'tối' : 'sáng'}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Nhấn để chuyển
            </div>
          </button>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
            Âm thanh và thông báo
          </h3>
          <div className="rounded-xl bg-white dark:bg-gray-800 p-3">
            <button
              type="button"
              onClick={toggleSounds}
              aria-pressed={soundsEnabled}
              className="w-full flex items-center gap-3 text-left"
            >
              {soundsEnabled
                ? <Volume2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                : <VolumeX className="w-5 h-5 text-slate-500" />}
              <span className="flex-1">
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">Âm thanh trong ứng dụng</span>
                <span className="block mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Tin nhắn, cuộc gọi, ghép đôi và chạm mặt
                </span>
              </span>
              <span className={`relative h-6 w-11 rounded-full transition-colors ${soundsEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${soundsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </span>
            </button>
            <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700 flex items-center justify-between gap-3">
              <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Khi ứng dụng đã đóng, điện thoại dùng âm thông báo hệ thống.
              </p>
              <button
                type="button"
                disabled={!soundsEnabled}
                onClick={() => void playAppSound('message-in', { cooldownMs: 0 })}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
              >
                Nghe thử
              </button>
            </div>
          </div>
        </div>

        {/* Help & Tutorial */}
        {onShowTour && (
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
              Trợ giúp
            </h3>
            <button
              onClick={() => {
                onShowTour();
              }}
              className="w-full flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
            >
              <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <div className="flex-1 text-left">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  Xem hướng dẫn sử dụng
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Tìm hiểu các tính năng của TVU Connect
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Account Actions */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
            Tài khoản
          </h3>
          
          {/* Logout Button */}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 p-3 bg-red-50 dark:bg-gray-800 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-all mb-2"
          >
            <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">
              Đăng xuất
            </span>
          </button>

          {/* Delete Account Button */}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all border-2 border-red-200 dark:border-red-800"
          >
            <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                Xóa tài khoản
              </div>
              <div className="text-xs text-red-500 dark:text-red-500">
                Xóa vĩnh viễn, không thể khôi phục
              </div>
            </div>
          </button>
        </div>

        {/* Privacy & Safety */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
            Quyền riêng tư
          </h3>
          <button
            onClick={onShowBlockedList ?? undefined}
            disabled={!onShowBlockedList}
            className="w-full flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldOff className="w-5 h-5 text-red-500 dark:text-red-400" />
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                Danh sách chặn
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Quản lý những người bạn đã chặn
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Privacy & Terms */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
            Pháp lý
          </h3>
          <div className="space-y-2">
            <a
              href="/privacy-policy.html"
              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            >
              <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Chính sách bảo mật
              </span>
            </a>
            <a
              href="/terms-of-service.html"
              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            >
              <Shield className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Điều khoản sử dụng
              </span>
            </a>
          </div>
        </div>

        {/* App Info */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-400 pt-2">
          <p>TVU Connect v1.0</p>
          <p>© 2026 All rights reserved</p>
        </div>
      </div>

      {/* Delete Account Modal */}
      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        userEmail={user.email || ''}
      />
    </>
  );
};
