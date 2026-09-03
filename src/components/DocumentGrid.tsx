import { BookOpen } from 'lucide-react';
import { DocumentCard } from './DocumentCard';
import { DocumentLink } from '../types/documentLink';
import { User } from 'firebase/auth';

interface DocumentGridProps {
  documents: DocumentLink[];
  loading: boolean;
  currentUser: User;
  onEdit: (document: DocumentLink) => void;
  onDelete: (id: string) => void;
  onProfileClick?: (uid: string) => void;
}

export function DocumentGrid({ documents, loading, currentUser, onEdit, onDelete, onProfileClick }: DocumentGridProps) {
  // Loading skeleton - single column
  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-5 overflow-x-hidden">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 md:p-5 animate-pulse">
            <div className="flex items-center gap-3 md:gap-4">
              {/* Icon skeleton */}
              <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              
              <div className="flex-1 min-w-0">
                {/* Title skeleton */}
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                
                {/* Uploader info skeleton */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                </div>
                
                {/* Tags skeleton */}
                <div className="flex gap-2 mb-2">
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20"></div>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-24"></div>
                </div>
                
                {/* Description skeleton - desktop only */}
                <div className="hidden md:block space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                </div>
              </div>
              
              {/* Button skeleton */}
              <div className="flex-shrink-0">
                <div className="h-11 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (documents.length === 0) {
    return (
      <div className="text-center py-12 md:py-16">
        <BookOpen className="w-12 h-12 md:w-16 md:h-16 mx-auto text-gray-400 mb-3 md:mb-4" />
        <p className="text-gray-600 dark:text-gray-400 text-base md:text-lg font-medium mb-1 md:mb-2">
          Không tìm thấy tài liệu phù hợp
        </p>
        <p className="text-gray-500 dark:text-gray-500 text-xs md:text-sm">
          Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm
        </p>
      </div>
    );
  }

  // Document grid - single column for horizontal cards
  return (
    <div className="flex flex-col gap-4 md:gap-5 overflow-x-hidden">
      {documents.map((document) => (
        <DocumentCard
          key={document.id}
          document={document}
          currentUser={currentUser}
          onEdit={onEdit}
          onDelete={onDelete}
          onProfileClick={onProfileClick}
        />
      ))}
    </div>
  );
}
