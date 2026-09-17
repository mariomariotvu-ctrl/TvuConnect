import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';

interface DocumentViewerModalProps {
  open: boolean;
  title: string;
  url: string;
  onClose: () => void;
}

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

export function DocumentViewerModal({ open, title, url, onClose }: DocumentViewerModalProps) {
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

  const viewerUrl = getEmbeddedDocumentUrl(url);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex bg-slate-950/70 p-0 md:p-4" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title">
      <section className="m-auto flex h-full w-full max-w-7xl flex-col overflow-hidden bg-white md:h-[94dvh] md:rounded-2xl dark:bg-slate-950">
        <header className="flex min-h-16 items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800">
          <FileText className="h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="document-viewer-title" className="truncate text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Đang xem trong TVU Connect</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Đóng trình xem tài liệu">
            <X className="h-5 w-5" />
          </button>
        </header>
        <iframe
          src={viewerUrl}
          title={`Tài liệu: ${title}`}
          className="min-h-0 flex-1 border-0 bg-slate-100 dark:bg-slate-900"
          referrerPolicy="no-referrer"
          sandbox="allow-downloads allow-forms allow-same-origin allow-scripts"
        />
      </section>
    </div>,
    document.body,
  );
}
