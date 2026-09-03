import React from 'react';
import { User } from 'firebase/auth';
import { StudentProfile } from '../types';
import { PostCard } from './PostCard';
import { CreatePost } from './CreatePost';
import { Loader2, MessageSquare } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { usePostsSimple } from '../hooks/usePostsSimple';

import { PostSkeleton } from './PostSkeleton';
import { motion } from 'motion/react';

interface PostsListProps {
  currentUser: User;
  userProfile: StudentProfile | null;
  onProfileClick?: (userId: string) => void;
}

const PostsListInner: React.FC<PostsListProps> = ({ currentUser, userProfile, onProfileClick }) => {
  const { theme } = useTheme();
  const { posts, loading, refresh } = usePostsSimple();

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center mb-6">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto mb-2 animate-pulse" />
          <div className="h-6 w-64 bg-gray-100 dark:bg-gray-800 rounded-lg mx-auto animate-pulse" />
        </div>
        {[1, 2, 3].map(i => <PostSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div 
        className="text-center mb-8 px-4 animate-slide"
      >
        <h2 className="text-3xl md:text-4xl font-black mb-3 tracking-tight page-heading">
          Bảng tin TVU
        </h2>
        <p className="text-base md:text-lg font-semibold max-w-lg mx-auto posts-subtitle">
          Nơi nhịp đập sinh viên Trà Vinh cùng hòa quyện 🌟
        </p>
      </div>

      {/* Create Post */}
      <CreatePost 
        user={currentUser} 
        userProfile={userProfile}
        onPostCreated={refresh}
      />

      {/* Posts List */}
      {posts.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center border"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.6)' : '#ffffff',
            borderColor: theme === 'dark' ? 'rgba(55,65,81,0.8)' : '#e5e7eb',
          }}
        >
          <MessageSquare className="mx-auto mb-4 w-16 h-16" style={{ color: theme === 'dark' ? '#4b5563' : '#d1d5db' }} />
          <p className="font-medium text-base" style={{ color: theme === 'dark' ? '#d1d5db' : '#374151' }}>
            Chưa có bài viết nào. Hãy là người đầu tiên chia sẻ!
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={currentUser}
                onProfileClick={onProfileClick}
                onDelete={refresh}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const PostsList = React.memo(PostsListInner);
