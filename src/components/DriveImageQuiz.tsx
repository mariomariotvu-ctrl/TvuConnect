import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  Image as ImageIcon,
  Images,
  RotateCcw,
} from 'lucide-react';
import type { DocumentLink } from '../types/documentLink';
import {
  getDriveImageSources,
  getImageQuizGroupKey,
  getImageQuizStorageKey,
  reconcileImageQuizOrder,
  sortImageQuizDocuments,
} from '../utils/imageQuiz';
import { DocumentViewerModal } from './DocumentViewerModal';

interface DriveImageQuizProps {
  documents: DocumentLink[];
}

interface QuizImageProps {
  document: DocumentLink;
  questionNumber: number;
  onOpen: () => void;
}

function loadSavedOrder(groupKey: string): string[] {
  try {
    const rawValue = window.localStorage.getItem(getImageQuizStorageKey(groupKey));
    if (!rawValue) return [];
    const value = JSON.parse(rawValue);
    return Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : [];
  } catch {
    return [];
  }
}

function QuizImage({ document, questionNumber, onOpen }: QuizImageProps) {
  const sources = useMemo(() => getDriveImageSources(document), [document]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex];

  useEffect(() => setSourceIndex(0), [document.id]);

  if (!source) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-56 w-full flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-slate-500 dark:bg-slate-950 dark:text-slate-400"
      >
        <ImageIcon className="h-10 w-10" aria-hidden="true" />
        <span className="text-sm font-semibold">Mở ảnh câu {questionNumber}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/image relative block w-full overflow-hidden bg-slate-50 text-left dark:bg-slate-950"
      aria-label={`Xem đầy đủ câu ${questionNumber}: ${document.title}`}
    >
      <img
        src={source}
        alt={`Câu ${questionNumber}: ${document.title}`}
        className="mx-auto block max-h-[72svh] min-h-52 w-full object-contain transition-transform duration-300 group-hover/image:scale-[1.01] md:min-h-64"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          if (sourceIndex < sources.length - 1) setSourceIndex((index) => index + 1);
        }}
      />
      <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/image:opacity-100 group-focus-visible/image:opacity-100">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        Phóng to
      </span>
    </button>
  );
}

export function DriveImageQuiz({ documents }: DriveImageQuizProps) {
  const groupKey = useMemo(() => getImageQuizGroupKey(documents[0]), [documents]);
  const documentSignature = documents.map((document) => document.id).sort().join('|');
  const [orderedDocuments, setOrderedDocuments] = useState(() => (
    reconcileImageQuizOrder(documents, loadSavedOrder(groupKey))
  ));
  const [selectedDocument, setSelectedDocument] = useState<DocumentLink | null>(null);
  const draggedIdRef = useRef<string | null>(null);
  const touchDraggedIdRef = useRef<string | null>(null);
  const quizRef = useRef<HTMLDivElement | null>(null);

  const folderPath = documents[0]?.folderPath || [];
  const quizTitle = folderPath.at(-1) || 'Bộ ảnh học liệu';

  useEffect(() => {
    setOrderedDocuments(reconcileImageQuizOrder(documents, loadSavedOrder(groupKey)));
  }, [documentSignature, groupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      window.localStorage.setItem(
        getImageQuizStorageKey(groupKey),
        JSON.stringify(orderedDocuments.map((document) => document.id)),
      );
    } catch {
      // The quiz still works when storage is disabled; only persistence is skipped.
    }
  }, [groupKey, orderedDocuments]);

  const moveDocument = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setOrderedDocuments((current) => {
      const sourceIndex = current.findIndex((document) => document.id === sourceId);
      const targetIndex = current.findIndex((document) => document.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const moveByOffset = (documentId: string, offset: number) => {
    setOrderedDocuments((current) => {
      const sourceIndex = current.findIndex((document) => document.id === documentId);
      const targetIndex = sourceIndex + offset;
      if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= current.length) return current;

      const next = [...current];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
      return next;
    });
  };

  const resetOrder = () => {
    try {
      window.localStorage.removeItem(getImageQuizStorageKey(groupKey));
    } catch {
      // Ignore unavailable storage and still reset the visible quiz.
    }
    setOrderedDocuments(sortImageQuizDocuments(documents));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm dark:border-indigo-900/60 dark:bg-slate-900">
      <header className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-fuchsia-50 p-4 dark:border-indigo-900/60 dark:from-indigo-950/50 dark:via-slate-900 dark:to-fuchsia-950/30 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                <Images className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em]">Quiz ảnh · {orderedDocuments.length} câu</p>
                <h3 className="truncate text-lg font-bold text-slate-950 dark:text-white">{quizTitle}</h3>
              </div>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
              Ảnh hiện trực tiếp theo đúng thứ tự. Kéo biểu tượng <GripVertical className="inline h-4 w-4" aria-hidden="true" /> để sắp xếp; thay đổi được lưu trên máy này.
            </p>
            {folderPath.length > 1 && (
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={folderPath.join(' / ')}>
                {folderPath.slice(0, -1).join(' / ')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={resetOrder}
            className="inline-flex min-h-10 flex-none items-center justify-center gap-2 self-start rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Xếp tự động
          </button>
        </div>
      </header>

      <div ref={quizRef} className="grid grid-cols-1 gap-4 bg-slate-100/70 p-3 dark:bg-slate-950/70 md:grid-cols-2 md:p-5">
        {orderedDocuments.map((document, index) => (
          <article
            key={document.id}
            data-quiz-image-id={document.id}
            draggable
            onDragStart={(event) => {
              draggedIdRef.current = document.id;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', document.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = draggedIdRef.current || event.dataTransfer.getData('text/plain');
              if (sourceId) moveDocument(sourceId, document.id);
              draggedIdRef.current = null;
            }}
            onDragEnd={() => { draggedIdRef.current = null; }}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
          >
            <div className="flex min-h-12 items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <button
                type="button"
                className="flex h-9 w-9 flex-none touch-none cursor-grab items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-700 active:cursor-grabbing dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                aria-label={`Kéo để đổi vị trí câu ${index + 1}`}
                title="Giữ và kéo để sắp xếp"
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse') return;
                  event.preventDefault();
                  touchDraggedIdRef.current = document.id;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const sourceId = touchDraggedIdRef.current;
                  if (!sourceId || event.pointerType === 'mouse') return;
                  const target = window.document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>('[data-quiz-image-id]');
                  if (target && quizRef.current?.contains(target)) {
                    const targetId = target.dataset.quizImageId;
                    if (targetId) moveDocument(sourceId, targetId);
                  }
                }}
                onPointerUp={() => { touchDraggedIdRef.current = null; }}
                onPointerCancel={() => { touchDraggedIdRef.current = null; }}
              >
                <GripVertical className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white">Câu {index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200" title={document.title}>
                {document.title}
              </span>
              <div className="flex flex-none items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveByOffset(document.id, -1)}
                  disabled={index === 0}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-25 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label={`Đưa câu ${index + 1} lên trước`}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => moveByOffset(document.id, 1)}
                  disabled={index === orderedDocuments.length - 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-25 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label={`Đưa câu ${index + 1} xuống sau`}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <QuizImage
              document={document}
              questionNumber={index + 1}
              onOpen={() => setSelectedDocument(document)}
            />
          </article>
        ))}
      </div>

      {selectedDocument && (
        <DocumentViewerModal
          open
          title={selectedDocument.title}
          url={selectedDocument.url}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </section>
  );
}
