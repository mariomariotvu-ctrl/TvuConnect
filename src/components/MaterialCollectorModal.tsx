import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Check,
  ExternalLink,
  FolderSearch2,
  Link2,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  searchAcademicMaterials,
  type AcademicDiscoveryLink,
  type CollectedAcademicSource,
} from '../utils/academicMaterialSearch';
import {
  addGoogleDriveShortcutToLibrary,
  getGoogleDrivePublicMetadata,
  parseGoogleDriveReference,
} from '../utils/googleDriveClient';

interface MaterialCollectorModalProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onSaveExternalSource: (source: CollectedAcademicSource, query: string) => Promise<void>;
  onLibraryChanged: () => void;
}

function inferCategory(source: CollectedAcademicSource): string {
  const text = `${source.title} ${source.url}`.toLowerCase();
  if (/giáo trình|giao[-_ ]?trinh|textbook/.test(text)) return 'Giáo trình';
  if (/đề thi|de[-_ ]?thi|exam|quiz/.test(text)) return 'Đề thi';
  if (/slide|\.pptx?(?:$|[?#])/.test(text)) return 'Slide bài giảng';
  if (/bài tập|bai[-_ ]?tap|exercise/.test(text)) return 'Bài tập';
  if (/\.pdf(?:$|[?#])|ebook|sách|book/.test(text)) return 'Sách PDF';
  return 'Tài liệu tham khảo';
}

export function materialSourceToFormDefaults(source: CollectedAcademicSource, query: string) {
  return {
    title: source.title.slice(0, 200),
    major_id: 'hoc-lieu-chung',
    subject: query.trim().slice(0, 120) || 'Học liệu chung',
    category: inferCategory(source),
    url: source.url,
    description: source.discoveredFrom
      ? `Nguồn được gom từ ${source.discoveredFrom}`.slice(0, 500)
      : 'Nguồn học liệu công khai được gom bằng TVU Connect.',
  };
}

export function MaterialCollectorModal({
  open,
  initialQuery = '',
  onClose,
  onSaveExternalSource,
  onLibraryChanged,
}: MaterialCollectorModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [sources, setSources] = useState<CollectedAcademicSource[]>([]);
  const [discoveryLinks, setDiscoveryLinks] = useState<AcademicDiscoveryLink[]>([]);
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyUrl, setBusyUrl] = useState('');
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [initialQuery, open]);

  const hasInput = useMemo(() => Boolean(query.trim() || sourceUrl.trim() || sourceText.trim()), [query, sourceText, sourceUrl]);

  if (!open) return null;

  const collect = async () => {
    if (!hasInput || loading) return;
    setLoading(true);
    setWarning('');
    try {
      const result = await searchAcademicMaterials({ query, sourceUrl, sourceText });
      setSources(result.sources);
      setDiscoveryLinks(result.discoveryLinks);
      setWarning(result.sourceWarning);
      if (result.sources.length) {
        toast.success(`Đã tìm thấy ${result.sources.length} link học liệu, đã tự loại link trùng.`);
      } else {
        toast.info('Chưa thấy link trực tiếp. Hãy mở nguồn tìm, rồi dán bài hoặc bình luận vào đây.');
      }
    } catch (error) {
      console.error('Material collection failed:', error);
      toast.error(error instanceof Error ? error.message : 'Không thể quét nguồn tài liệu.');
    } finally {
      setLoading(false);
    }
  };

  const saveSource = async (source: CollectedAcademicSource) => {
    if (busyUrl) return;
    setBusyUrl(source.url);
    try {
      const driveReference = source.driveFileId
        ? { fileId: source.driveFileId, kind: 'file' as const }
        : parseGoogleDriveReference(source.url);

      if (source.kind === 'folder') {
        toast.info('Đây là cả thư mục. Hãy mở thư mục và chọn các file cần gom để tránh nhập nhầm tài liệu riêng tư.');
        return;
      }

      if (driveReference) {
        const metadata = await getGoogleDrivePublicMetadata(driveReference.fileId);
        const imported = await addGoogleDriveShortcutToLibrary(metadata.id, metadata.name);
        setSavedUrls((current) => new Set(current).add(source.url));
        if (imported.alreadyExists) {
          toast.info(`“${metadata.name}” đã có trong Thư viện TVU Connect.`);
        } else if (imported.location === 'tvu-library') {
          toast.success(`Đã gom “${metadata.name}” vào thư mục Drive TVU Connect.`);
          onLibraryChanged();
        } else {
          toast.warning(`Tài khoản này chưa có quyền sửa thư mục chung. Đã lưu shortcut “${metadata.name}” vào My Drive.`);
        }
        return;
      }

      await onSaveExternalSource(source, query);
      setSavedUrls((current) => new Set(current).add(source.url));
      toast.success('Đã thêm nguồn công khai vào Thư viện TVU Connect.');
    } catch (error) {
      console.error('Could not save collected material:', error);
      toast.error(error instanceof Error ? error.message : 'Không thể gom tài liệu này.');
    } finally {
      setBusyUrl('');
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[10020] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="flex max-h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92dvh] sm:rounded-3xl dark:bg-slate-950" aria-labelledby="material-collector-title">
        <header className="flex items-start gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-4 text-white dark:border-slate-800">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15">
            <FolderSearch2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="material-collector-title" className="text-lg font-extrabold">Gom tài liệu từ nhiều nguồn</h2>
            <p className="mt-1 text-xs leading-relaxed text-indigo-100">Tìm bài đăng, dán bình luận hoặc link nguồn. Hệ thống tự nhặt link Drive/PDF, loại trùng và kiểm tra trước khi lưu.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-900 dark:text-white">Tên môn hoặc tài liệu</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-950 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="Ví dụ: Triết học Mác – Lênin"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-900 dark:text-white">Link bài đăng hoặc trang nguồn</label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-950 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="Facebook, website trường, Drive…"
                />
              </div>
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1.5 block text-sm font-bold text-slate-900 dark:text-white">Nội dung bài viết hoặc bình luận</label>
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              rows={4}
              className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-950 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder={'Dán nguyên bình luận có nhiều link vào đây. Ví dụ:\nChị gửi em các file nhé https://drive.google.com/...'}
            />
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Với nhóm Facebook riêng hoặc bài cần đăng nhập, hãy dán nội dung bình luận vì máy chủ không được phép đọc thay tài khoản của bạn.</p>
          </div>

          <button
            type="button"
            onClick={() => void collect()}
            disabled={!hasInput || loading}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderSearch2 className="h-5 w-5" />}
            {loading ? 'Đang quét và kiểm tra link…' : 'Tìm và quét tài liệu'}
          </button>

          {warning && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{warning}</div>
          )}

          {discoveryLinks.length > 0 && (
            <section className="mt-5" aria-label="Nguồn tìm kiếm">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Tìm rộng ở nhiều nguồn</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Mở nguồn phù hợp, sau đó dán bài hoặc bình luận có link trở lại khung trên.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {discoveryLinks.map((link) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm font-bold text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                    <span>{link.title}</span>
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {sources.length > 0 && (
            <section className="mt-5" aria-label="Tài liệu đã tìm thấy">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Link tài liệu đã tìm thấy</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sources.length} kết quả sau khi loại trùng. Bạn vẫn là người chọn tài liệu được đưa vào thư viện.</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {sources.map((source) => {
                  const saved = savedUrls.has(source.url);
                  const busy = busyUrl === source.url;
                  return (
                    <article key={source.url} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-indigo-600 shadow-sm dark:bg-slate-950 dark:text-indigo-300">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-bold text-slate-950 dark:text-white">{source.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{source.provider || new URL(source.url).hostname}</p>
                      </div>
                      <div className="flex gap-2">
                        <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 sm:flex-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                          Mở <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void saveSource(source)}
                          disabled={saved || Boolean(busyUrl)}
                          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60 sm:flex-none"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <FolderSearch2 className="h-4 w-4" />}
                          {saved ? 'Đã gom' : source.kind === 'folder' ? 'Mở thư mục' : 'Gom vào thư viện'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
