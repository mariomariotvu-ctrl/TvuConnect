import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Download, Image as ImageIcon, ShieldAlert, X } from 'lucide-react';
import { getImagePermissionHelp, isMobileDevice, isStandaloneApp, requestAppInstall } from '../utils/platform';

interface ImageSourcePickerProps {
  children: (openPicker: () => void) => React.ReactNode;
  onFilesSelected: (files: File[]) => void | Promise<void>;
  multiple?: boolean;
  disabled?: boolean;
  title?: string;
}

/**
 * A permission-safe image picker shared by every upload surface.
 * Gallery selection never requests camera access; taking a photo is kept on a
 * separate, explicit input so a denied camera permission cannot block uploads.
 */
export const ImageSourcePicker: React.FC<ImageSourcePickerProps> = ({
  children,
  onFilesSelected,
  multiple = false,
  disabled = false,
  title = 'Thêm ảnh',
}) => {
  const id = useId().replace(/:/g, '');
  const [open, setOpen] = useState(false);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const mobile = isMobileDevice();
  const standalone = isStandaloneApp();

  const close = () => {
    setOpen(false);
    setShowPermissionHelp(false);
  };

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length === 0) return;

    close();
    await onFilesSelected(files);
  };

  const picker = open && typeof document !== 'undefined' && createPortal(
    <div className="fixed inset-0 z-[13000] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" aria-label="Đóng bộ chọn ảnh" onClick={close} />
      <section className="relative w-full rounded-t-[1.75rem] border border-slate-200 bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-md sm:rounded-[1.75rem] sm:pb-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">TVU Connect</p>
            <h2 id={`${id}-title`} className="mt-1 text-xl font-black text-slate-950 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">Chọn nguồn ảnh phù hợp với thiết bị của bạn.</p>
          </div>
          <button type="button" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${id}-gallery`} className="flex min-h-24 cursor-pointer items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left transition active:scale-[0.98] dark:border-indigo-800/50 dark:bg-indigo-950/30">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm dark:bg-slate-950">
              <ImageIcon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-extrabold text-slate-950 dark:text-white">Chọn ảnh có sẵn</span>
              <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">Không cần quyền camera</span>
            </span>
          </label>
          <input id={`${id}-gallery`} type="file" accept="image/*" multiple={multiple} className="sr-only" onChange={handleFiles} />

          {mobile && (
            <>
              <label htmlFor={`${id}-camera`} className="flex min-h-24 cursor-pointer items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left transition active:scale-[0.98] dark:border-violet-800/50 dark:bg-violet-950/30">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm dark:bg-slate-950">
                  <Camera className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-extrabold text-slate-950 dark:text-white">Chụp ảnh mới</span>
                  <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">Dùng camera sau</span>
                </span>
              </label>
              <input id={`${id}-camera`} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFiles} />
            </>
          )}
        </div>

        <button type="button" onClick={() => setShowPermissionHelp((value) => !value)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <ShieldAlert className="h-4 w-4" />
          Camera hoặc thư viện bị từ chối quyền?
        </button>

        {showPermissionHelp && (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
            <p className="text-xs font-semibold leading-5 text-amber-950 dark:text-amber-100">{getImagePermissionHelp()}</p>
            {!standalone && (
              <button
                type="button"
                onClick={() => {
                  close();
                  requestAppInstall();
                }}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
              >
                <Download className="h-4 w-4" />
                Cài TVU Connect như ứng dụng
              </button>
            )}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );

  return (
    <>
      {children(() => {
        if (!disabled) setOpen(true);
      })}
      {picker}
    </>
  );
};
