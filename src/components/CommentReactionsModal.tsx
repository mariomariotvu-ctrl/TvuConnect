import React, { useState } from 'react';
import { X, User as UserIcon } from 'lucide-react';
import { Reaction, ReactionType } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface CommentReactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reactions: Reaction[];
  onProfileClick?: (userId: string) => void;
}

const REACTION_EMOJIS: Record<ReactionType, string> = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😮',
  sad: '😢',
  angry: '😡',
};

const REACTION_LABELS: Record<ReactionType, string> = {
  like: 'Thích',
  love: 'Yêu thích',
  haha: 'Haha',
  wow: 'Wow',
  sad: 'Buồn',
  angry: 'Phẫn nộ',
};

export const CommentReactionsModal: React.FC<CommentReactionsModalProps> = ({
  isOpen,
  onClose,
  reactions,
  onProfileClick
}) => {
  const { theme } = useTheme();
  const [selectedTab, setSelectedTab] = useState<ReactionType | 'all'>('all');

  if (!isOpen) return null;

  // Count reactions by type
  const reactionCounts = reactions.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {} as Record<ReactionType, number>);

  // Filter reactions by selected tab
  const filteredReactions = selectedTab === 'all'
    ? reactions
    : reactions.filter(r => r.type === selectedTab);

  // Get unique reaction types that exist
  const existingTypes = Object.keys(reactionCounts) as ReactionType[];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col"
        style={{
          backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}
        >
          <h3
            className="text-lg font-bold"
            style={{ color: theme === 'dark' ? '#ffffff' : '#000000' }}
          >
            Cảm xúc
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5" style={{ color: theme === 'dark' ? '#9ca3af' : '#6b7280' }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-4 border-b overflow-x-auto"
          style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}
        >
          <button
            onClick={() => setSelectedTab('all')}
            className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-colors ${
              selectedTab === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Tất cả {reactions.length}
          </button>
          {existingTypes.map(type => (
            <button
              key={type}
              onClick={() => setSelectedTab(type)}
              className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-colors flex items-center gap-1 ${
                selectedTab === type
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <span className="text-base">{REACTION_EMOJIS[type]}</span>
              <span>{reactionCounts[type]}</span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredReactions.length === 0 ? (
            <p className="text-center text-gray-400 py-8">
              Chưa có cảm xúc nào
            </p>
          ) : (
            <div className="space-y-3">
              {filteredReactions.map((reaction, index) => (
                <div
                  key={`${reaction.userId}-${index}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <button
                    onClick={() => {
                      onProfileClick?.(reaction.userId);
                      onClose();
                    }}
                    className="flex items-center gap-3 flex-1"
                  >
                    {reaction.userAvatar ? (
                      <img
                        src={reaction.userAvatar}
                        alt={reaction.userName}
                        className="w-10 h-10 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-600 dark:to-blue-600 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-indigo-600 dark:text-white" />
                      </div>
                    )}
                    <span
                      className="font-semibold text-sm"
                      style={{ color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                      {reaction.userName}
                    </span>
                  </button>
                  <span className="text-2xl">{REACTION_EMOJIS[reaction.type]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
