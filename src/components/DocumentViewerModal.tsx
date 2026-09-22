import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
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
  GoogleDriveError,
  isGoogleDriveFolderUrl,
  loadGoogleDriveFile,
  parseGoogleDriveReference,
} from '../utils/googleDriveClient';

interface DocumentViewerModalProps {
  open: boolean;
  title: string;
  url: string;
  onClose: () => void;
}

interface ReadyDriveState {
  status: 'ready';
  blob: Blob;
  objectUrl: string;
  fileName: string;
  originalMimeType: string;
  mimeType: string;
}

type DriveViewerState =
  | { status: 'checking' | 'connecting'; message?: string }
  | { status: 'permission' | 'error'; message: string }
  | { status: 'embedded'; url: string }
  | ReadyDriveState;

const OFFICE_FILE = /\.(docx?|xlsx?|pptx?)(?:$|[?#])/i;
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OFFICE_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function isDocxFile(mimeType: string, fileName: string): boolean {
  return mimeType === DOCX_MIME_TYPE || /\.docx$/i.test(fileName);
}

function isOfficeFile(mimeType: string, fileName: string): boolean {
  return OFFICE_MIME_TYPES.has(mimeType) || /\.(doc|xls|xlsx|ppt|pptx)$/i.test(fileName);
}

interface DocxPreviewProps {
  blob: Blob;
  fileName: string;
  objectUrl: string;
}

function DocxPreview({ blob, fileName, objectUrl }: DocxPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    let cancelled = false;
    preview.replaceChildren();
    setStatus('loading');

    const render = async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;

        await renderAsync(blob, preview, preview, {
          breakPages: true,
          ignoreHeight: window.innerWidth < 768,
          ignoreLastRenderedPageBreak: false,
          ignoreWidth: window.innerWidth < 768,
          renderEndnotes: true,
          renderFooters: true,
          renderFootnotes: true,
          renderHeaders: true,
          useBase64URL: true,
        });

        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    void render();
    return () => {
      cancelled = true;
      preview.replaceChildren();
    };
  }, [blob]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">Đang xem file Word trực tiếp</p>
        <a
          href={objectUrl}
          download={fileName}
          className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Tải bản gốc
        </a>
      </div>

      <div className="docx-preview-shell relative min-h-0 flex-1 overflow-auto">
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90 p-6 dark:bg-slate-950/90">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">Đang dựng nội dung Word…</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm dark:border-red-900/60 dark:bg-slate-900">
              <FileWarning className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
              <h3 className="mt-3 font-bold text-slate-950 dark:text-white">Chưa thể dựng file Word này</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Bạn vẫn có thể tải bản gốc để mở bằng Word.</p>
            </div>
          </div>
        )}

        <div ref={previewRef} className={status === 'ready' ? 'min-h-full' : 'invisible min-h-full'} />
      </div>
    </div>
  );
}

interface PdfPreviewProps {
  blob: Blob;
  fileName: string;
}

function PdfPreview({ blob, fileName }: PdfPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageProgress, setPageProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    let pdfDocument: { cleanup: () => Promise<unknown> } | null = null;
    preview.replaceChildren();
    setStatus('loading');
    setPageProgress({ current: 0, total: 0 });

    const render = async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        if (cancelled) return;

        const data = new Uint8Array(await blob.arrayBuffer());
        const task = pdfjs.getDocument({ data });
        loadingTask = task;
        const pdf = await task.promise;
        pdfDocument = pdf;
        if (cancelled) return;

        setPageProgress({ current: 0, total: pdf.numPages });
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.min(960, Math.max(320, preview.clientWidth - 32));
          const scale = Math.min(1.65, Math.max(0.75, availableWidth / baseViewport.width));
          const viewport = page.getViewport({ scale });
          const outputScale = Math.min(window.devicePixelRatio || 1, 1.5);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d', { alpha: false });
          if (!context) throw new Error('Trình duyệt không hỗ trợ dựng PDF.');

          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = 'block h-auto max-w-full bg-white shadow-sm';

          const pageShell = document.createElement('figure');
          pageShell.className = 'mx-auto flex w-fit max-w-full flex-col items-center gap-2';
          pageShell.setAttribute('aria-label', `Trang ${pageNumber} / ${pdf.numPages}`);
          pageShell.appendChild(canvas);

          const caption = document.createElement('figcaption');
          caption.className = 'text-xs font-medium text-slate-500 dark:text-slate-400';
          caption.textContent = `Trang ${pageNumber} / ${pdf.numPages}`;
          pageShell.appendChild(caption);
          preview.appendChild(pageShell);

          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          }).promise;
          if (!cancelled) setPageProgress({ current: pageNumber, total: pdf.numPages });
        }

        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    void render();
    return () => {
      cancelled = true;
      preview.replaceChildren();
      void loadingTask?.destroy();
      void pdfDocument?.cleanup();
    };
  }, [blob]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">Đang xem PDF trực tiếp</p>
        <p className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {pageProgress.total > 0
            ? `${pageProgress.current || 1} / ${pageProgress.total} trang`
            : fileName}
        </p>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto">
        {status === 'loading' && (
          <div className="sticky top-3 z-10 mx-auto mt-3 flex w-fit items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-semibold text-slate-700 shadow-md backdrop-blur dark:bg-slate-900/95 dark:text-slate-200">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            {pageProgress.total > 0
              ? `Đang dựng trang ${Math.max(1, pageProgress.current + 1)} / ${pageProgress.total}…`
              : 'Đang dựng PDF…'}
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm dark:border-red-900/60 dark:bg-slate-900">
              <FileWarning className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
              <h3 className="mt-3 font-bold text-slate-950 dark:text-white">Chưa thể dựng PDF này</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">File có thể bị lỗi hoặc dùng định dạng PDF chưa được hỗ trợ.</p>
            </div>
          </div>
        )}

        <div ref={previewRef} className="space-y-5 p-3 md:p-5" />
      </div>
    </div>
  );
}

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
      return 'File chưa được chia sẻ công khai. Chủ file cần bật “Bất kỳ ai có liên kết đều có thể xem”.';
    case 'network':
      return 'Không thể kết nối Google Drive. Kiểm tra mạng rồi thử lại.';
    default:
      return error.message || 'Không thể tải tài liệu từ Google Drive.';
  }
}

export function DocumentViewerModal({ open, title, url, onClose }: DocumentViewerModalProps) {
  const driveReference = useMemo(() => parseGoogleDriveReference(url), [url]);
  const isDriveFolder = useMemo(() => isGoogleDriveFolderUrl(url), [url]);
  const embeddedUrl = useMemo(() => getEmbeddedDocumentUrl(url), [url]);
  const officeViewerUrl = useMemo(() => {
    if (!driveReference) return embeddedUrl;
    const proxyOrigin = window.location.hostname === 'localhost'
      ? 'https://tvuconnect.vercel.app'
      : window.location.origin;
    const directDownloadUrl = `${proxyOrigin}/api/drive-office?fileId=${encodeURIComponent(driveReference.fileId)}`;
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(directDownloadUrl)}`;
  }, [driveReference, embeddedUrl]);
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
      blob: content.blob,
      objectUrl,
      fileName: content.name,
      originalMimeType: content.originalMimeType,
      mimeType: content.previewMimeType,
    });
  }, [revokeObjectUrl]);

  useEffect(() => {
    if (!open || !driveReference) return;

    let cancelled = false;
    setDriveState({ status: 'checking' });

    const load = async () => {
      try {
        const content = await loadGoogleDriveFile(driveReference.fileId);
        if (!cancelled) showDriveContent(content);
      } catch (error) {
        if (cancelled) return;

        if (error instanceof GoogleDriveError && (error.code === 'too-large' || error.code === 'not-downloadable')) {
          setDriveState({ status: 'embedded', url: embeddedUrl });
          return;
        }

        setDriveState({
          status: error instanceof GoogleDriveError && error.code === 'permission' ? 'permission' : 'error',
          message: getDriveErrorMessage(error),
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
      revokeObjectUrl();
    };
  }, [driveReference, embeddedUrl, open, revokeObjectUrl, showDriveContent]);

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

    if (driveState.status === 'embedded') {
      return (
        <iframe
          src={driveState.url}
          title={`Tài liệu: ${title}`}
          className="min-h-0 flex-1 border-0 bg-white dark:bg-slate-900"
          allow="autoplay"
        />
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
              onClick={() => setDriveState({ status: 'embedded', url: embeddedUrl })}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử bản xem trực tuyến
            </button>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-left text-xs leading-relaxed text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>TVU Connect không yêu cầu đăng nhập Google. Quyền xem vẫn do chủ file kiểm soát.</span>
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
              onClick={() => setDriveState({ status: 'embedded', url: embeddedUrl })}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử bản xem trực tuyến
            </button>
          </div>
        </div>
      );
    }

    const readyState = driveState as ReadyDriveState;

    if (isDocxFile(readyState.mimeType, readyState.fileName)) {
      return (
        <DocxPreview
          blob={readyState.blob}
          fileName={readyState.fileName}
          objectUrl={readyState.objectUrl}
        />
      );
    }

    if (isOfficeFile(readyState.originalMimeType, readyState.fileName)) {
      return (
        <div className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
          <div className="flex min-h-12 shrink-0 items-center border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
              Đang xem file Office trực tiếp
            </p>
          </div>
          <iframe
            src={officeViewerUrl}
            title={`Tài liệu: ${title}`}
            className="min-h-0 flex-1 border-0 bg-white dark:bg-slate-900"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      );
    }

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

    if (readyState.mimeType === 'application/pdf') {
      return (
        <PdfPreview
          blob={readyState.blob}
          fileName={readyState.fileName}
        />
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

  return createPortal(
    <div className="document-viewer-modal fixed inset-0 z-[10020] flex bg-slate-950/70 p-0 md:p-4" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title">
      <section className="m-auto flex h-full w-full max-w-7xl flex-col overflow-hidden bg-white md:h-[94dvh] md:rounded-2xl dark:bg-slate-950">
        <header className="flex min-h-16 items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
          <FileText className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="document-viewer-title" className="truncate text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {driveReference
                ? 'Google Drive · xem an toàn trong TVU Connect'
                : isDriveFolder
                  ? 'Liên kết Google Drive cần được sửa'
                  : 'Đang xem trong TVU Connect'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Đóng trình xem tài liệu">
            <X className="h-5 w-5" />
          </button>
        </header>

        {driveReference ? renderDriveViewer() : isDriveFolder ? (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
            <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm dark:border-amber-900/60 dark:bg-slate-900">
              <FileWarning className="mx-auto h-9 w-9 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">Liên kết thư mục không thể xem</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Tài liệu này đang trỏ đến cả thư mục Google Drive. Người đăng cần sửa tài liệu và chọn một file PDF, Word, Excel hoặc PowerPoint cụ thể.
              </p>
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-left text-xs leading-relaxed text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>TVU Connect không mở trang Drive lỗi và cũng không yêu cầu quyền truy cập toàn bộ thư mục của bạn.</span>
              </div>
            </div>
          </div>
        ) : (
          <iframe
            src={embeddedUrl}
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
