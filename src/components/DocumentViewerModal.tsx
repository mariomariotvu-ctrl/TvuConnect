import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Cloud,
  Download,
  FileText,
  FileWarning,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  canPreviewMimeType,
  getCachedGoogleDriveToken,
  GoogleDriveError,
  loadGoogleDriveFile,
  parseGoogleDriveReference,
  pickGoogleDriveFile,
} from '../utils/googleDriveClient';

interface DocumentViewerModalProps {
  open: boolean;
  title: string;
  url: string;
  onClose: () => void;
}

interface ReadyDriveState {
  status: 'ready';
  objectUrl: string;
  fileName: string;
  mimeType: string;
}

type DriveViewerState =
  | { status: 'checking' | 'connecting'; message?: string }
  | { status: 'permission' | 'error'; message: string }
  | ReadyDriveState;

const OFFICE_FILE = /\.(docx?|xlsx?|pptx?)(?:$|[?#])/i;

export function getEmbeddedDocumentUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    if (url.hostname === 'drive.google.com') {
      const fileId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
      if (fileId) return `https://drive.google.com/file/d/${fileId}/preview`;
    }

    if (url.hostname === 'docs.google.com') {
      const match = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
      if (match) return `https://docs.google.com/${match[1]}/d/${match[2]}/preview`;
    }

    if (OFFICE_FILE.test(url.href)) {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url.href)}`;
    }

    return url.href;
  } catch {
    return rawUrl;
  }
}

function getDriveErrorMessage(error: unknown): string {
  if (!(error instanceof GoogleDriveError)) {
    return 'Không thể tải tài liệu. Vui lòng thử lại.';
  }

  switch (error.code) {
    case 'configuration':
      return 'Google Drive chưa được cấu hình đầy đủ cho môi trường này.';
    case 'not-downloadable':
    case 'too-large':
      return error.message;
    case 'permission':
      return 'File đang giới hạn quyền. Hãy kết nối Google Drive và chọn đúng file để xác nhận quyền xem.';
    case 'network':
      return 'Không thể kết nối Google Drive. Kiểm tra mạng rồi thử lại.';
    default:
      return error.message || 'Không thể tải tài liệu từ Google Drive.';
  }
}

export function DocumentViewerModal({ open, title, url, onClose }: DocumentViewerModalProps) {
  const driveReference = useMemo(() => parseGoogleDriveReference(url), [url]);
  const [driveState, setDriveState] = useState<DriveViewerState>({ status: 'checking' });
  const objectUrlRef = useRef<string | null>(null);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const showDriveContent = useCallback((content: Awaited<ReturnType<typeof loadGoogleDriveFile>>) => {
    revokeObjectUrl();
    const objectUrl = URL.createObjectURL(content.blob);
    objectUrlRef.current = objectUrl;
    setDriveState({
      status: 'ready',
      objectUrl,
      fileName: content.name,
      mimeType: content.previewMimeType,
    });
  }, [revokeObjectUrl]);

  const loadDriveReference = useCallback(async (accessToken?: string) => {
    if (!driveReference) return;
    const content = await loadGoogleDriveFile(driveReference.fileId, accessToken);
    showDriveContent(content);
  }, [driveReference, showDriveContent]);

  useEffect(() => {
    if (!open || !driveReference) return;

    let cancelled = false;
    setDriveState({ status: 'checking' });

    const load = async () => {
      const cachedToken = getCachedGoogleDriveToken();
      try {
        const content = await loadGoogleDriveFile(driveReference.fileId, cachedToken || undefined);
        if (!cancelled) showDriveContent(content);
      } catch (authenticatedError) {
        if (cancelled) return;

        if (cachedToken && authenticatedError instanceof GoogleDriveError && authenticatedError.code === 'permission') {
          try {
            const publicContent = await loadGoogleDriveFile(driveReference.fileId);
            if (!cancelled) showDriveContent(publicContent);
            return;
          } catch (publicError) {
            if (cancelled) return;
            setDriveState({
              status: publicError instanceof GoogleDriveError && publicError.code === 'permission' ? 'permission' : 'error',
              message: getDriveErrorMessage(publicError),
            });
            return;
          }
        }

        setDriveState({
          status: authenticatedError instanceof GoogleDriveError && authenticatedError.code === 'permission' ? 'permission' : 'error',
          message: getDriveErrorMessage(authenticatedError),
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
      revokeObjectUrl();
    };
  }, [driveReference, open, revokeObjectUrl, showDriveContent]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  const handleConnectDrive = async () => {
    if (!driveReference) return;
    setDriveState({ status: 'connecting', message: 'Đang mở Google Drive…' });

    try {
      const selected = await pickGoogleDriveFile();
      if (!selected) {
        setDriveState({
          status: 'permission',
          message: 'Bạn chưa chọn file. TVU Connect chưa nhận thêm quyền truy cập nào.',
        });
        return;
      }

      if (selected.id !== driveReference.fileId) {
        setDriveState({
          status: 'permission',
          message: `Bạn vừa chọn “${selected.name}”, không phải tài liệu đang mở. Hãy chọn đúng file trong Google Drive.`,
        });
        return;
      }

      setDriveState({ status: 'connecting', message: 'Đang tải file vào TVU Connect…' });
      await loadDriveReference(selected.accessToken);
    } catch (error) {
      if (error instanceof GoogleDriveError && error.code === 'cancelled') {
        setDriveState({
          status: 'permission',
          message: 'Kết nối đã được hủy. File trên Google Drive vẫn giữ nguyên quyền riêng tư.',
        });
        return;
      }
      setDriveState({ status: 'error', message: getDriveErrorMessage(error) });
    }
  };

  if (!open) return null;

  const renderDriveViewer = () => {
    if (driveState.status === 'checking' || driveState.status === 'connecting') {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
          <div className="text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
              {driveState.message || 'Đang kiểm tra quyền truy cập Google Drive…'}
            </p>
          </div>
        </div>
      );
    }

    if (driveState.status === 'permission') {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <LockKeyhole className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-slate-950 dark:text-white">Tài liệu đang giới hạn quyền</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{driveState.message}</p>
            <button
              type="button"
              onClick={() => void handleConnectDrive()}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <Cloud className="h-4 w-4" aria-hidden="true" />
              Kết nối và chọn file trên Drive
            </button>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-left text-xs leading-relaxed text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>TVU Connect chỉ xin quyền với file bạn tự chọn, giữ token trong phiên hiện tại và không quét toàn bộ Drive.</span>
            </div>
          </div>
        </div>
      );
    }

    if (driveState.status === 'error') {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm dark:border-red-900/60 dark:bg-slate-900">
            <FileWarning className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">Chưa thể mở tài liệu</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{driveState.message}</p>
            <button
              type="button"
              onClick={() => void handleConnectDrive()}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử kết nối lại
            </button>
          </div>
        </div>
      );
    }

    const readyState = driveState as ReadyDriveState;

    if (readyState.mimeType.startsWith('image/')) {
      return (
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-950">
          <img src={readyState.objectUrl} alt={readyState.fileName} className="mx-auto max-h-full max-w-full rounded-lg object-contain" />
        </div>
      );
    }

    if (readyState.mimeType.startsWith('video/')) {
      return <video src={readyState.objectUrl} controls className="min-h-0 flex-1 bg-black object-contain" />;
    }

    if (readyState.mimeType.startsWith('audio/')) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
          <audio src={readyState.objectUrl} controls className="w-full max-w-xl" />
        </div>
      );
    }

    if (canPreviewMimeType(readyState.mimeType)) {
      return (
        <iframe
          src={readyState.objectUrl}
          title={`Tài liệu: ${title}`}
          className="min-h-0 flex-1 border-0 bg-slate-100 dark:bg-slate-900"
          sandbox="allow-downloads allow-forms allow-same-origin allow-scripts"
        />
      );
    }

    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <FileText className="mx-auto h-9 w-9 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <h3 className="mt-3 font-bold text-slate-950 dark:text-white">Định dạng này chưa xem trực tiếp được</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Bạn có thể tải bản gốc đã được Google Drive cấp quyền.</p>
          <a
            href={readyState.objectUrl}
            download={readyState.fileName}
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Tải {readyState.fileName}
          </a>
        </div>
      </div>
    );
  };

  const viewerUrl = getEmbeddedDocumentUrl(url);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex bg-slate-950/70 p-0 md:p-4" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title">
      <section className="m-auto flex h-full w-full max-w-7xl flex-col overflow-hidden bg-white md:h-[94dvh] md:rounded-2xl dark:bg-slate-950">
        <header className="flex min-h-16 items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
          <FileText className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="document-viewer-title" className="truncate text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {driveReference ? 'Google Drive · xem an toàn trong TVU Connect' : 'Đang xem trong TVU Connect'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Đóng trình xem tài liệu">
            <X className="h-5 w-5" />
          </button>
        </header>

        {driveReference ? renderDriveViewer() : (
          <iframe
            src={viewerUrl}
            title={`Tài liệu: ${title}`}
            className="min-h-0 flex-1 border-0 bg-slate-100 dark:bg-slate-900"
            referrerPolicy="no-referrer"
            sandbox="allow-downloads allow-forms allow-same-origin allow-scripts"
          />
        )}
      </section>
    </div>,
    document.body,
  );
}
