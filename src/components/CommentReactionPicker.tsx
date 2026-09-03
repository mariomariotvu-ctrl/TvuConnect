import React, { useState, useRef, useEffect } from 'react';
import { ReactionType } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface CommentReactionPickerProps {
  onReact: (type: ReactionType) => void;
  currentReaction?: ReactionType;
}

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'like', emoji: '👍', label: 'Thích' },
  { type: 'love', emoji: '❤️', label: 'Yêu thích' },
  { type: 'haha', emoji: '😂', label: 'Haha' },
  { type: 'wow', emoji: '😮', label: 'Wow' },
  { type: 'sad', emoji: '😢', label: 'Buồn' },
  { type: 'angry', emoji: '😡', label: 'Phẫn nộ' },
];

export const CommentReactionPicker: React.FC<CommentReactionPickerProps> = ({
  onReact,
  currentReaction
}) => {
  const { theme } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPicker]);

  const handleMouseEnter = () => {
    const timer = setTimeout(() => {
      setShowPicker(true);
    }, 500); // Show after 500ms hover
    setLongPressTimer(timer);
  };

  const handleMouseLeave = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleClick = () => {
    if (currentReaction) {
      // If already reacted, toggle off
      onReact(currentReaction);
    } else {
      // Quick like
      onReact('like');
    }
  };

  const handleReactionClick = (type: ReactionType) => {
    onReact(type);
    setShowPicker(false);
  };

  const getCurrentReactionEmoji = () => {
    if (!currentReaction) return null;
    const reaction = REACTIONS.find(r => r.type === currentReaction);
    return reaction?.emoji;
  };

  return (
    <div className="relative inline-block" ref={pickerRef}>
      <button
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`text-xs font-bold transition-colors ${
          currentReaction
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400'
        }`}
      >
        {getCurrentReactionEmoji() ? (
          <span className="flex items-center gap-1">
            <span className="text-base">{getCurrentReactionEmoji()}</span>
            <span>Đã thả cảm xúc</span>
          </span>
        ) : (
          'Thích'
        )}
      </button>

      {/* Reaction Picker Popup */}
      {showPicker && (
        <div
          className="absolute bottom-full left-0 mb-2 flex gap-1 p-2 rounded-full shadow-lg border z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{
            backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
            borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
          }}
        >
          {REACTIONS.map(({ type, emoji, label }) => (
            <button
              key={type}
              onClick={() => handleReactionClick(type)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all hover:scale-125"
              title={label}
            >
              <span className="text-2xl">{emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
