import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Cloud, Folder, Home, Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import type { User } from 'firebase/auth';
import { toast } from 'sonner';
import { CreateDocumentModal } from './CreateDocumentModal';
import { DocumentGrid } from './DocumentGrid';
import { EditDocumentModal } from './EditDocumentModal';
import { FilterPanel } from './FilterPanel';
import { SearchBar } from './SearchBar';
import { useDocuments } from '../hooks/useDocuments';
import { createDocument, deleteDocument, updateDocument } from '../services/documentService';
import type { DocumentFormData, DocumentLink, FilterState } from '../types/documentLink';

interface DocumentRepositoryProps {
  currentUser: User;
  onProfileClick?: (uid: string) => void;
}

const CATEGORY_FILTERS = [
  { value: null, label: 'Tất cả học liệu' },
  { value: 'Sách PDF', label: 'Sách / sách mở' },
  { value: 'Giáo trình', label: 'Giáo trình' },
  { value: 'Tài liệu tham khảo', label: 'Tham khảo' },
  { value: 'Slide bài giảng', label: 'Slide' },
  { value: 'Đề thi', label: 'Đề thi' },
  { value: 'Bài tập', label: 'Bài tập' },
] as const;

const pathStartsWith = (path: string[] = [], prefix: string[]) => (
  prefix.every((part, index) => path[index] === part)
);

const pathEquals = (path: string[] = [], expected: string[]) => (
  path.length === expected.length && pathStartsWith(path, expected)
);

export function DocumentRepository({ currentUser, onProfileClick }: DocumentRepositoryProps) {
  const [filters, setFilters] = useState<FilterState>({ major_id: null, subject: null, category: null });
  const [searchKeyword, setSearchKeyword] = useState(() => (
    new URLSearchParams(window.location.search).get('q')?.trim() || ''
  ));
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentLink | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string[]>([]);
  const [displayLimit, setDisplayLimit] = useState(40);
  const deleteCancelledRef = useRef(false);

  const {
    documents,
    driveFolders,
    driveSyncing,
    loading,
    error,
    hasMore,
    loadingMore,
    loadMore,
    refresh,
    removeDocumentOptimistic,
    restoreDocument,
  } = useDocuments(filters, searchKeyword);

  const normalizedSearch = searchKeyword.trim();
  const browsingFolderTree = !normalizedSearch && !filters.category && !filters.major_id && !filters.subject;

  const immediateFolders = useMemo(() => {
    if (!browsingFolderTree) return [];
    const folders = new Map<string, { name: string; path: string[]; count: number }>();
    for (const folder of driveFolders) {
      if (!pathEquals(folder.folderPath, selectedFolderPath)) continue;
      const nextPath = [...folder.folderPath, folder.name];
      const key = nextPath.join('\u0000');
      const count = documents.filter((document) => (
        document.source === 'google_drive' && pathStartsWith(document.folderPath, nextPath)
      )).length;
      folders.set(key, { name: folder.name, path: nextPath, count });
    }
    return [...folders.values()].sort((left, right) => left.name.localeCompare(right.name, 'vi'));
  }, [browsingFolderTree, documents, driveFolders, selectedFolderPath]);

  const documentsInView = useMemo(() => {
    if (!browsingFolderTree) return documents;
    return documents.filter((document) => {
      if (document.source !== 'google_drive') return selectedFolderPath.length === 0;
      return pathEquals(document.folderPath, selectedFolderPath);
    });
  }, [browsingFolderTree, documents, selectedFolderPath]);

  useEffect(() => {
    setDisplayLimit(40);
  }, [filters, normalizedSearch, selectedFolderPath]);

  useEffect(() => {
    if (!browsingFolderTree) setSelectedFolderPath([]);
  }, [browsingFolderTree]);

  const handleFilterChange = (filterType: string, value: string | null) => {
    setFilters((current) => ({ ...current, [filterType]: value }));
  };

  const handleCreateDocument = async (data: DocumentFormData) => {
    try {
      await createDocument(data, currentUser.uid);
      toast.success('Đã thêm tài liệu');
      refresh();
    } catch (error: any) {
      toast.error(error.message || 'Không thể thêm tài liệu');
      throw error;
    }
  };

  const handleUpdateDocument = async (id: string, data: DocumentFormData) => {
    try {
      await updateDocument(id, data);
      toast.success('Đã cập nhật tài liệu');
      refresh();
    } catch (error: any) {
      toast.error(error.message || 'Không thể cập nhật tài liệu');
      throw error;
    }
  };

  const handleDeleteDocument = async (id: string) => {
    const selectedDocument = documents.find((item) => item.id === id);
    if (!selectedDocument) return;
    if (selectedDocument.createdBy !== currentUser.uid) {
      toast.error('Bạn không có quyền xóa tài liệu này');
      return;
    }

    removeDocumentOptimistic(id);
    deleteCancelledRef.current = false;
    const toastId = `delete_${id}_${Date.now()}`;

    toast(
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Đã xóa tài liệu</span>
        <button
          type="button"
          onClick={() => {
            deleteCancelledRef.current = true;
            toast.dismiss(toastId);
            restoreDocument(selectedDocument);
          }}
          className="min-h-9 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Hoàn tác
        </button>
      </div>,
      { id: toastId, duration: 5000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 5000));
    if (deleteCancelledRef.current) return;

    try {
      await deleteDocument(id);
    } catch (error: any) {
      restoreDocument(selectedDocument);
      toast.error(error.code === 'permission-denied'
        ? 'Bạn không có quyền xóa tài liệu này'
        : error.message || 'Không thể xóa tài liệu');
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-3 pb-24 pt-3 sm:px-4 md:pb-6">
      <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900" aria-labelledby="library-title">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 id="library-title" className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl dark:text-white">Thư viện học liệu</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Tìm sách mở, giáo trình và tài liệu theo ngành. Mọi tài liệu được xem trực tiếp trong TVU Connect.
            </p>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <button type="button" onClick={refresh} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" />Đồng bộ</button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Đóng góp tài liệu
          </button>
        </div>
      </section>

      <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
        {driveSyncing
          ? <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
          : <Cloud className="mt-0.5 h-5 w-5 shrink-0" />}
        <p><strong>Đang dùng thư mục “tặng all TVU”.</strong> {driveSyncing ? 'Danh sách môn học đã dùng được; tài liệu bên trong đang tiếp tục đồng bộ nền.' : 'File mới trong các thư mục môn học sẽ tự xuất hiện.'} Nhánh riêng tư không làm gián đoạn phần thư viện còn lại.</p>
      </div>

      <div className="mb-4">
        <SearchBar value={searchKeyword} onChange={setSearchKeyword} placeholder="Tìm theo tiêu đề, ngành học hoặc môn học" />
      </div>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/70" aria-label="Lọc loại học liệu">
        <div className="mb-2 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
          <p className="text-sm font-bold text-slate-800 dark:text-white">Sách và tài liệu theo loại</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORY_FILTERS.map((category) => {
            const active = filters.category === category.value;
            return (
              <button
                key={category.label}
                type="button"
                onClick={() => handleFilterChange('category', category.value)}
                className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-semibold ${active
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-indigo-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950/40'}`}
                aria-pressed={active}
              >
                {category.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span>Chỉ chia sẻ sách mở, giáo trình được cấp phép hoặc liên kết chính thức. TVU Connect không lưu bản sao sách chưa được cho phép.</span>
        </div>
      </section>

      <FilterPanel filters={filters} onFilterChange={handleFilterChange} availableSubjects={[]} />

      {error && (
        <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          Không thể tải tài liệu. Vui lòng thử lại.
        </div>
      )}

      {browsingFolderTree && (
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/70" aria-label="Thư mục học liệu">
          <nav className="mb-3 flex min-h-10 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm scrollbar-none" aria-label="Đường dẫn thư mục">
            <button
              type="button"
              onClick={() => setSelectedFolderPath([])}
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 font-semibold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Tất cả môn học
            </button>
            {selectedFolderPath.map((part, index) => (
              <span key={`${part}-${index}`} className="inline-flex shrink-0 items-center gap-1">
                <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setSelectedFolderPath(selectedFolderPath.slice(0, index + 1))}
                  className="min-h-9 rounded-lg px-2 font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {part}
                </button>
              </span>
            ))}
          </nav>

          {immediateFolders.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {immediateFolders.map((folder) => (
                <button
                  key={folder.path.join('/')}
                  type="button"
                  onClick={() => setSelectedFolderPath(folder.path)}
                  className="group flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/60 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                    <Folder className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">{folder.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{folder.count > 0 ? `${folder.count} tài liệu` : driveSyncing ? 'Đang đồng bộ…' : 'Chưa có file công khai'}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-600" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {(!browsingFolderTree || immediateFolders.length === 0 || documentsInView.length > 0 || loading) && (
        <DocumentGrid
          documents={documentsInView.slice(0, displayLimit)}
          loading={loading}
          currentUser={currentUser}
          onEdit={(selectedDocument) => {
            setEditingDocument(selectedDocument);
            setShowEditModal(true);
          }}
          onDelete={handleDeleteDocument}
          onProfileClick={onProfileClick}
        />
      )}

      {!loading && documentsInView.length > displayLimit && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setDisplayLimit((current) => current + 40)}
            className="inline-flex min-h-11 min-w-44 items-center justify-center rounded-xl border border-indigo-200 bg-white px-5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300"
          >
            Xem thêm {Math.min(40, documentsInView.length - displayLimit)} tài liệu
          </button>
        </div>
      )}

      {!loading && hasMore && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex min-h-11 min-w-44 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loadingMore ? 'Đang tải…' : 'Xem thêm học liệu'}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-20 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 sm:hidden"
        aria-label="Đóng góp tài liệu"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </button>

      <CreateDocumentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateDocument}
        currentUser={currentUser}
      />
      <EditDocumentModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingDocument(null);
        }}
        onSubmit={handleUpdateDocument}
        document={editingDocument}
      />
    </div>
  );
}
