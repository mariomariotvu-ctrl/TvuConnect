import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ReactionType } from '../types';

interface ReactionPickerProps {
  onReact: (type: ReactionType) => void;
  currentReaction?: ReactionType;
}

const REACTIONS = [
  { type: 'like' as ReactionType, emoji: '👍', label: 'Thích' },
  { type: 'love' as ReactionType, emoji: '❤️', label: 'Yêu thích' },
  { type: 'haha' as ReactionType, emoji: '😂', label: 'Haha' },
  { type: 'wow' as ReactionType, emoji: '😮', label: 'Wow' },
  { type: 'sad' as ReactionType, emoji: '😢', label: 'Buồn' },
  { type: 'angry' as ReactionType, emoji: '😠', label: 'Phẫn nộ' },
];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onReact, currentReaction }) => {
  const [showPicker, setShowPicker] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Tính toán vị trí động cho picker để không tràn viewport
  const calculatePickerPosition = () => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const PICKER_WIDTH = 280;
    const PICKER_HEIGHT = 60;

    const spaceRight = window.innerWidth - rect.left;
    const spaceAbove = rect.top;

    const style: React.CSSProperties = {};

    // Horizontal: flip nếu tràn phải
    if (spaceRight < PICKER_WIDTH) {
      style.right = 0;
      style.left = 'auto';
    } else {
      style.left = 0;
      style.right = 'auto';
    }

    // Vertical: hiển thị bên dưới nếu không đủ chỗ trên
    if (spaceAbove < PICKER_HEIGHT + 10) {
      style.top = 'calc(100% + 8px)';
      style.bottom = 'auto';
    } else {
      style.bottom = 'calc(100% + 8px)';
      style.top = 'auto';
    }

    setPickerStyle(style);
  };

  // Tính lại vị trí picker mỗi khi showPicker = true
  useEffect(() => {
    if (showPicker) {
      calculatePickerPosition();
    }
  }, [showPicker]);

  // Desktop hover
  const handleMouseEnter = () => {
    // Don't show picker if we're processing a reaction
    if (isProcessing) return;
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPicker(true);
    }, 300);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPicker(false);
    }, 200);
  };

  const handleReactionClick = (type: ReactionType) => {
    // Prevent multiple clicks
    if (isProcessing) return;
    setIsProcessing(true);
    
    // Clear any pending hover timeouts immediately
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    const reaction = REACTIONS.find(r => r.type === type);
    if (reaction) {
      // Create floating emoji
      const id = Date.now();
      const x = Math.random() * 40 - 20;
      setFloatingEmojis(prev => [...prev, { id, emoji: reaction.emoji, x }]);
      
      setTimeout(() => {
        setFloatingEmojis(prev => prev.filter(e => e.id !== id));
      }, 1000);
    }
    
    // Close picker immediately with fade-out animation
    setShowPicker(false);
    
    // Call onReact after a tiny delay to ensure UI updates smoothly
    setTimeout(() => {
      onReact(type);
      // Reset processing state after reaction completes
      setTimeout(() => {
        setIsProcessing(false);
      }, 300);
    }, 50);
  };

  // Simple click handler
  const handleButtonClick = () => {
    // Don't toggle if processing
    if (isProcessing) return;
    setShowPicker(!showPicker);
  };

  // Show the reaction user selected, or default thumbs up
  const currentReactionData = REACTIONS.find(r => r.type === currentReaction);
  const displayEmoji = currentReactionData ? currentReactionData.emoji : '👍';
  const displayLabel = currentReactionData ? currentReactionData.label : 'Thích';
  const hasReacted = !!currentReaction;

  return (
    <div 
      className="relative" 
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Floating Emojis */}
      <AnimatePresence>
        {floatingEmojis.map(({ id, emoji, x }) => (
          <motion.div
            key={id}
            initial={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            animate={{ 
              opacity: 0, 
              y: -60, 
              x: x,
              scale: 1.5,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="absolute bottom-0 left-1/2 pointer-events-none text-2xl"
            style={{ zIndex: 100 }}
          >
            {emoji}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Backdrop for mobile */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setShowPicker(false)}
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
          />
        )}
      </AnimatePresence>

      {/* Reaction Picker Popup */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute mb-2 bg-white dark:bg-gray-800 rounded-full shadow-2xl border border-gray-200 dark:border-gray-700 px-3 py-2 flex gap-2 z-50"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{ 
              ...pickerStyle,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {REACTIONS.map((reaction) => (
              <button
                key={reaction.type}
                onClick={() => handleReactionClick(reaction.type)}
                disabled={isProcessing}
                className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-95 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                title={reaction.label}
                type="button"
              >
                <span className="text-2xl pointer-events-none">{reaction.emoji}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Button */}
      <button
        onClick={handleButtonClick}
        type="button"
        className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all text-sm touch-manipulation select-none ${
          hasReacted
            ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
        }`}
      >
        <span className="text-lg pointer-events-none">{displayEmoji}</span>
        <span className="pointer-events-none">{displayLabel}</span>
      </button>
    </div>
  );
};
