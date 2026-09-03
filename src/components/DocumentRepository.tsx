import React, { useState, useRef } from 'react';
import { Plus } from 'lucide-react';
import { User } from 'firebase/auth';
import { SearchBar } from './SearchBar';
import { FilterPanel } from './FilterPanel';
import { DocumentGrid } from './DocumentGrid';
import { CreateDocumentModal } from './CreateDocumentModal';
import { EditDocumentModal } from './EditDocumentModal';
import { FilterState, DocumentLink, DocumentFormData } from '../types/documentLink';
import { useDocuments } from '../hooks/useDocuments';
import { createDocument, updateDocument, deleteDocument } from '../services/documentService';
import { toast } from 'sonner';

interface DocumentRepositoryProps {
  currentUser: User;
  onProfileClick?: (uid: string) => void;
}

export function DocumentRepository({ currentUser, onProfileClick }: DocumentRepositoryProps) {
  // State
  const [filters, setFilters] = useState<FilterState>({
    major_id: null,
    subject: null,
    category: null
  });
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentLink | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteCancelledRef = useRef(false);

  // Fetch documents using custom hook
  const { documents, loading, error, refresh, removeDocumentOptimistic, restoreDocument } = useDocuments(filters, searchKeyword);

  // Handle filter changes
  const handleFilterChange = (filterType: string, value: string | null) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // Handle search
  const handleSearch = (keyword: string) => {
    setSearchKeyword(keyword);
  };

  // Handle create document
  const handleCreateDocument = async (data: DocumentFormData) => {
    try {
      await createDocument(data, currentUser.uid);
      toast.success('Đã thêm tài liệu thành công');
      refresh();
    } catch (error: any) {
      toast.error(error.message || 'Đã xảy ra lỗi khi thêm tài liệu');
      throw error;
    }
  };

  // Handle edit document
  const handleEditDocument = (document: DocumentLink) => {
    setEditingDocument(document);
    setShowEditModal(true);
  };

  // Handle update document
  const handleUpdateDocument = async (id: string, data: DocumentFormData) => {
    try {
      await updateDocument(id, data);
      toast.success('Đã cập nhật tài liệu thành công');
      refresh();
    } catch (error: any) {
      toast.error(error.message || 'Đã xảy ra lỗi khi cập nhật tài liệu');
      throw error;
    }
  };

  // Handle delete document - with 5-second undo window
  const handleDeleteDocument = async (id: string) => {
    // Find the document to check ownership
    const document = documents.find(d => d.id === id);
    
    // Client-side permission check
    if (document && document.createdBy !== currentUser.uid) {
      toast.error('Bạn không có quyền xóa tài liệu này');
      return;
    }

    if (!document) return;

    // ── STEP 1: XÓA KHỎI UI NGAY LẬP TỨC ───────────────────────────────────
    removeDocumentOptimistic(id);

    // ── STEP 2: HIỆN TOAST HOÀN TÁC 5 GIÂY ─────────────────────────────────
    deleteCancelledRef.current = false;
    const toastId = `delete_${id}_${Date.now()}`;

    toast(
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Đã xóa tài liệu</span>
        <button
          onClick={() => {
            deleteCancelledRef.current = true;
            toast.dismiss(toastId);
            restoreDocument(document);
          }}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex-shrink-0"
        >
          Hoàn tác
        </button>
      </div>,
      { id: toastId, duration: 5000 }
    );

    // ── STEP 3: CHỜ 5 GIÂY RỒI MỚI XÓA FIRESTORE ───────────────────────────
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (deleteCancelledRef.current) return;

    setIsDeleting(true);
    try {
      await deleteDocument(id);
      // Xóa cache hẳn để lần tiếp theo fetch fresh từ Firestore
      const cacheKey = `docs_${JSON.stringify(filters)}`;
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(`${cacheKey}_timestamp`);
    } catch (error: any) {
      // Firestore thất bại → khôi phục lại document
      restoreDocument(document);
      if (error.code === 'permission-denied') {
        toast.error('Bạn không có quyền xóa tài liệu này');
      } else {
        toast.error(error.message || 'Đã xảy ra lỗi khi xóa tài liệu');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 md:pb-3 pb-20">
      {/* Hero Header Section - Mobile Optimized */}
      <div className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-400 via-purple-400 to-blue-500 dark:from-purple-800 dark:via-blue-800 dark:to-indigo-900 p-3 md:p-4 shadow-xl">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-10 dark:opacity-5">
          <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-white rounded-full translate-x-1/3 translate-y-1/3"></div>
        </div>

        <div className="relative z-10">
          {/* Title and CTA Button Row - Mobile Optimized */}
          <div className="flex items-center justify-between gap-2 md:gap-4 mb-2 md:mb-3">
            <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
              {/* Enhanced Book Icon - Smaller on mobile */}
              <div className="relative group flex-shrink-0">
                {/* Glow effect background */}
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-300 via-orange-300 to-pink-300 rounded-xl blur-md opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
                
                {/* Icon container with gradient background */}
                <div className="relative p-1.5 md:p-2.5 bg-gradient-to-br from-white/30 via-white/20 to-white/10 backdrop-blur-md rounded-xl border border-white/30 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                  {/* Animated sparkles - slowed down */}
                  <div className="absolute -top-1 -right-1 w-1.5 md:w-2 h-1.5 md:h-2 bg-yellow-300 rounded-full animate-pulse" style={{ animationDuration: '3s' }}></div>
                  <div className="absolute -bottom-1 -left-1 w-1 md:w-1.5 h-1 md:h-1.5 bg-blue-300 rounded-full animate-pulse" style={{ animationDelay: '0.5s', animationDuration: '4s' }}></div>
                  
                  {/* Book icon with enhanced design */}
                  <svg className="w-5 h-5 md:w-6 md:h-6 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24">
                    {/* Book cover - left page */}
                    <path d="M3 6c0-1.1.9-2 2-2h5a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" opacity="0.9"/>
                    {/* Book cover - right page */}
                    <path d="M14 4h5a2 2 0 012 2v14a2 2 0 01-2 2h-5a2 2 0 01-2-2V6a2 2 0 012-2z" opacity="0.7"/>
                    {/* Book spine */}
                    <path d="M12 4v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                    {/* Decorative lines on pages */}
                    <path d="M6 9h3M6 12h3M6 15h3" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
                    <path d="M15 9h3M15 12h3M15 15h3" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
                  </svg>
                  
                  {/* Shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>
              </div>
              
              <h1 className="text-lg md:text-2xl lg:text-3xl font-black text-white drop-shadow-lg truncate">
                Kho Tài Liệu TVU
              </h1>
            </div>
            
            {/* Desktop CTA Button - Hidden on mobile */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="hidden md:flex group relative items-center gap-2.5 px-7 py-3.5 bg-white text-purple-700 rounded-2xl hover:shadow-2xl transition-all duration-500 font-bold flex-shrink-0 overflow-hidden border-2 border-purple-200 hover:border-purple-400 hover:scale-105"
            >
              {/* Animated gradient background on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              {/* Shimmer effect */}
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
              
              {/* Floating particles */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                <div className="absolute top-2 left-4 w-1.5 h-1.5 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.5s' }}></div>
                <div className="absolute top-3 right-6 w-1 h-1 bg-pink-300 rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.8s' }}></div>
                <div className="absolute bottom-3 left-8 w-1 h-1 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '2s' }}></div>
                <div className="absolute bottom-2 right-4 w-1.5 h-1.5 bg-green-300 rounded-full animate-bounce" style={{ animationDelay: '100ms', animationDuration: '1.6s' }}></div>
              </div>
              
              {/* Icon with glow */}
              <div className="relative z-10 flex items-center justify-center w-6 h-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg group-hover:rotate-90 group-hover:scale-110 transition-all duration-500 shadow-lg group-hover:shadow-purple-400/50">
                <Plus className="w-4 h-4 text-white" />
              </div>
              
              {/* Text with color transition */}
              <span className="relative z-10 group-hover:text-white transition-colors duration-500 tracking-wide">
                Đóng góp tài liệu
              </span>
              
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl bg-gradient-to-r from-purple-400 via-blue-400 to-indigo-400 -z-10"></div>
            </button>
          </div>

          {/* Inspiring Description - Mobile Optimized */}
          <div className="text-white">
            <p className="text-xs md:text-sm lg:text-base leading-relaxed">
              📚 <span className="font-bold">Sinh viên chúng ta cùng nhau xây dựng kho học liệu TVU bằng cách chia sẻ link liên kết từ Google Drive, OneDrive...</span>
            </p>
            
            {/* Info Cards - Mobile: Stack vertically, Desktop: 2 columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 mt-3 md:mt-4">
              {/* Card 1: Chia sẻ link tài liệu - Mobile Optimized */}
              <div className="relative overflow-hidden rounded-lg md:rounded-xl bg-white/40 dark:bg-white/10 backdrop-blur-md border border-white/60 dark:border-white/20 shadow-lg p-2.5 md:p-3.5">
                {/* Decorative gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/10 via-orange-400/5 to-transparent dark:from-yellow-400/5 dark:via-orange-400/3"></div>
                
                {/* Content */}
                <div className="relative z-10 flex items-center gap-2 md:gap-3">
                  {/* Enhanced Icon Container - Smaller on mobile */}
                  <div className="relative flex-shrink-0">
                    {/* Glow background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-300 via-orange-300 to-pink-300 rounded-lg blur-sm opacity-40 dark:opacity-30"></div>
                    
                    {/* Icon box */}
                    <div className="relative p-1.5 md:p-2 bg-gradient-to-br from-yellow-400/20 to-orange-400/20 dark:from-yellow-400/30 dark:to-orange-400/30 rounded-lg border border-yellow-300/30 dark:border-yellow-300/40">
                      <span className="text-xl md:text-2xl">📚</span>
                    </div>
                  </div>
                  
                  {/* Text Content */}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm md:text-base text-white drop-shadow-md truncate">Chia sẻ link tài liệu</h3>
                    <p className="text-xs md:text-sm text-white/90 mt-0.5 truncate">Google Drive, OneDrive...</p>
                  </div>
                </div>
                
                {/* Subtle shine effect (static) */}
                <div className="absolute top-0 right-0 w-16 md:w-20 h-16 md:h-20 bg-gradient-to-br from-white/20 to-transparent rounded-full blur-2xl"></div>
              </div>

              {/* Card 2: Tìm kiếm thông minh - Mobile Optimized */}
              <div className="relative overflow-hidden rounded-lg md:rounded-xl bg-white/40 dark:bg-white/10 backdrop-blur-md border border-white/60 dark:border-white/20 shadow-lg p-2.5 md:p-3.5">
                {/* Decorative gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 via-purple-400/5 to-transparent dark:from-blue-400/5 dark:via-purple-400/3"></div>
                
                {/* Content */}
                <div className="relative z-10 flex items-center gap-2 md:gap-3">
                  {/* Enhanced Icon Container - Smaller on mobile */}
                  <div className="relative flex-shrink-0">
                    {/* Glow background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-300 via-purple-300 to-pink-300 rounded-lg blur-sm opacity-40 dark:opacity-30"></div>
                    
                    {/* Icon box */}
                    <div className="relative p-1.5 md:p-2 bg-gradient-to-br from-blue-400/20 to-purple-400/20 dark:from-blue-400/30 dark:to-purple-400/30 rounded-lg border border-blue-300/30 dark:border-blue-300/40">
                      <span className="text-xl md:text-2xl">🎯</span>
                    </div>
                  </div>
                  
                  {/* Text Content */}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm md:text-base text-white drop-shadow-md truncate">Tìm kiếm thông minh</h3>
                    <p className="text-xs md:text-sm text-white/90 mt-0.5 truncate">Lọc theo ngành học, tìm nhanh</p>
                  </div>
                </div>
                
                {/* Subtle shine effect (static) */}
                <div className="absolute top-0 right-0 w-16 md:w-20 h-16 md:h-20 bg-gradient-to-br from-white/20 to-transparent rounded-full blur-2xl"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar - Enhanced */}
      <div className="mb-4">
        <SearchBar
          value={searchKeyword}
          onChange={handleSearch}
          placeholder="🔍 Tìm theo tiêu đề, ngành học (VD: dược, CNTT, y khoa)..."
        />
      </div>

      {/* Filter Panel */}
      <FilterPanel
        filters={filters}
        onFilterChange={handleFilterChange}
        availableSubjects={[]}
      />

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400">
            Đã xảy ra lỗi khi tải tài liệu. Vui lòng thử lại.
          </p>
        </div>
      )}

      {/* Document Grid */}
      <DocumentGrid
        documents={documents}
        loading={loading}
        currentUser={currentUser}
        onEdit={handleEditDocument}
        onDelete={handleDeleteDocument}
        onProfileClick={onProfileClick}
      />

      {/* Floating Action Button - Mobile Only */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="md:hidden fixed bottom-20 right-4 z-50 group"
        aria-label="Đóng góp tài liệu"
      >
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-blue-500 to-indigo-500 rounded-full blur-xl opacity-60 group-active:opacity-100 transition-opacity"></div>
        
        {/* Button */}
        <div className="relative flex items-center justify-center w-14 h-14 bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-600 rounded-full shadow-2xl group-active:scale-95 transition-transform">
          {/* Animated ring - softened */}
          <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-pulse" style={{ animationDuration: '3s' }}></div>
          
          {/* Icon */}
          <Plus className="w-7 h-7 text-white relative z-10" strokeWidth={2.5} />
          
          {/* Sparkles - slowed down */}
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDuration: '3s' }}></div>
          <div className="absolute -bottom-1 -left-1 w-1.5 h-1.5 bg-pink-300 rounded-full animate-bounce" style={{ animationDelay: '1s', animationDuration: '3.5s' }}></div>
        </div>
      </button>

      {/* Create Modal */}
      <CreateDocumentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateDocument}
        currentUser={currentUser}
      />

      {/* Edit Modal */}
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
