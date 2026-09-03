import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User as UserIcon } from 'lucide-react';
import { Reaction, ReactionType } from '../types';
import { db, doc, getDoc } from '../firebase';

interface ReactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reactions: Reaction[];
  onProfileClick?: (userId: string) => void;
}

interface ReactionWithProfile extends Reaction {
  currentPhotoURL?: string;
  currentFullName?: string;
}

const REACTION_EMOJIS: Record<ReactionType, string> = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😮',
  sad: '😢',
  angry: '😠',
};

const REACTION_LABELS: Record<ReactionType, string> = {
  like: 'Thích',
  love: 'Yêu thích',
  haha: 'Haha',
  wow: 'Wow',
  sad: 'Buồn',
  angry: 'Phẫn nộ',
};

export const ReactionsModal: React.FC<ReactionsModalProps> = ({ isOpen, onClose, reactions, onProfileClick }) => {
  const [selectedTab, setSelectedTab] = useState<ReactionType | 'all'>('all');
  const [reactionsWithProfiles, setReactionsWithProfiles] = useState<ReactionWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch current profile data when modal opens
  useEffect(() => {
    if (!isOpen || reactions.length === 0) {
      setReactionsWithProfiles([]);
      return;
    }

    const fetchProfileData = async () => {
      setIsLoading(true);
      try {
        const updatedReactions = await Promise.all(
          reactions.map(async (reaction) => {
            try {
              // Fetch current profile from Firestore
              const profileRef = doc(db, 'profiles', reaction.userId);
              const profileSnap = await getDoc(profileRef);
              
              if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                return {
                  ...reaction,
                  currentPhotoURL: profileData.photoURL || reaction.userAvatar,
                  currentFullName: profileData.fullName || reaction.userName,
                };
              }
              
              // If profile doesn't exist, use original data
              return {
                ...reaction,
                currentPhotoURL: reaction.userAvatar,
                currentFullName: reaction.userName,
              };
            } catch (error) {
              console.error('Error fetching profile for user:', reaction.userId, error);
              // On error, use original data
              return {
                ...reaction,
                currentPhotoURL: reaction.userAvatar,
                currentFullName: reaction.userName,
              };
            }
          })
        );
        
        setReactionsWithProfiles(updatedReactions);
      } catch (error) {
        console.error('Error fetching profile data:', error);
        // On error, use original reactions
        setReactionsWithProfiles(reactions.map(r => ({
          ...r,
          currentPhotoURL: r.userAvatar,
          currentFullName: r.userName,
        })));
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileData();
  }, [isOpen, reactions]);

  // Use reactionsWithProfiles if available, otherwise use original reactions
  const displayReactions = reactionsWithProfiles.length > 0 ? reactionsWithProfiles : reactions;

  // Count reactions by type
  const reactionCounts = displayReactions.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {} as Record<ReactionType, number>);

  // Filter reactions by selected tab
  const filteredReactions = selectedTab === 'all' 
    ? displayReactions 
    : displayReactions.filter(r => r.type === selectedTab);

  // Sort by most recent
  const sortedReactions = [...filteredReactions].sort((a, b) => {
    // Safely get timestamp
    const getTime = (timestamp: any): number => {
      if (!timestamp) return 0;
      if (timestamp instanceof Date) return timestamp.getTime();
      if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
      if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
      if (typeof timestamp === 'number') return timestamp;
      return 0;
    };
    
    const aTime = getTime(a.createdAt);
    const bTime = getTime(b.createdAt);
    return bTime - aTime;
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Cảm xúc ({reactions.length})
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 p-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            <button
              onClick={() => setSelectedTab('all')}
              className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition-all ${
                selectedTab === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Tất cả {reactions.length}
            </button>
            {(Object.keys(reactionCounts) as ReactionType[]).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedTab(type)}
                className={`px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition-all flex items-center gap-1 ${
                  selectedTab === type
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <span>{REACTION_EMOJIS[type]}</span>
                <span>{reactionCounts[type]}</span>
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Đang tải...</p>
              </div>
            ) : sortedReactions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Chưa có cảm xúc nào
              </div>
            ) : (
              <div className="space-y-3">
                {sortedReactions.map((reaction, index) => {
                  const reactionWithProfile = reaction as ReactionWithProfile;
                  const displayAvatar = reactionWithProfile.currentPhotoURL || reaction.userAvatar;
                  const displayName = reactionWithProfile.currentFullName || reaction.userName;
                  
                  return (
                    <motion.button
                      key={`${reaction.userId}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => onProfileClick?.(reaction.userId)}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all cursor-pointer w-full text-left group active:scale-98"
                    >
                      {/* Avatar - Shows current profile photo */}
                      {displayAvatar ? (
                        <img
                          src={displayAvatar}
                          alt={displayName}
                          className="w-12 h-12 rounded-full object-cover ring-2 ring-transparent group-hover:ring-indigo-500 transition-all"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-600 dark:to-blue-600 flex items-center justify-center ring-2 ring-transparent group-hover:ring-indigo-500 transition-all">
                          <UserIcon className="w-6 h-6 text-indigo-600 dark:text-white" />
                        </div>
                      )}

                      {/* Name - Shows current profile name */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {displayName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Nhấn để xem hồ sơ
                        </p>
                      </div>

                      {/* Reaction */}
                      <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30 transition-colors">
                        <span className="text-xl">{REACTION_EMOJIS[reaction.type]}</span>
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          {REACTION_LABELS[reaction.type]}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
