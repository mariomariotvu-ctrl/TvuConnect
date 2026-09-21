import React, { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { motion, AnimatePresence, useSpring } from 'motion/react';
import { Bot, X, Sparkles } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

// Lazy load the AI Assistant
const LazyAIAssistant = React.lazy(() =>
  import('./AIAssistant').then(module => ({ default: module.AIAssistant }))
);

// ── Kawaii Chat Bubble Character (SVG + Motion) ─────────────────────────────
const KawaiiCharacter: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const [blinkPhase, setBlinkPhase] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(false);

  // Blinking animation cycle
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinkPhase(true);
      // Double blink
      setTimeout(() => setBlinkPhase(false), 120);
      setTimeout(() => setBlinkPhase(true), 250);
      setTimeout(() => setBlinkPhase(false), 370);
    }, 3000);
    return () => clearInterval(blinkInterval);
  }, []);

  // Mouth animation cycle
  useEffect(() => {
    const mouthInterval = setInterval(() => {
      setMouthOpen(true);
      setTimeout(() => setMouthOpen(false), 600);
    }, 4500);
    return () => clearInterval(mouthInterval);
  }, []);

  return (
    <motion.div
      className="relative"
      style={{ width: 64, height: 64 }}
      animate={{ y: [0, -6, 0] }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {/* Floating Shadow */}
      <motion.div
        className="absolute"
        style={{
          bottom: -2,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 36,
          height: 6,
          borderRadius: '50%',
          background: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(0,0,0,0.1)',
          filter: 'blur(2px)',
        }}
        animate={{ scaleX: [1, 0.7, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Body wiggle wrapper */}
      <motion.div
        animate={{ rotate: [-3, 3, -3] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="64" height="60" viewBox="0 0 64 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* ── Bubble Body ── */}
          <rect x="4" y="2" width="56" height="42" rx="20" fill="white" />
          {/* Tail */}
          <path d="M18 42 L26 56 L30 42" fill="white" />

          {/* ── Eyes ── */}
          {blinkPhase ? (
            <>
              {/* Closed eyes (happy curves) */}
              <path d="M20 22 Q23 19 26 22" stroke="#2d2d3f" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <path d="M38 22 Q41 19 44 22" stroke="#2d2d3f" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              {/* Open eyes */}
              <ellipse cx="23" cy="20" rx="5" ry="6" fill="#2d2d3f" />
              <ellipse cx="41" cy="20" rx="5" ry="6" fill="#2d2d3f" />
              {/* Pupil highlights */}
              <circle cx="25" cy="18" r="2" fill="white" />
              <circle cx="43" cy="18" r="2" fill="white" />
              {/* Small secondary highlights */}
              <circle cx="21.5" cy="22" r="1" fill="white" opacity="0.6" />
              <circle cx="39.5" cy="22" r="1" fill="white" opacity="0.6" />
            </>
          )}

          {/* ── Mouth ── */}
          {mouthOpen ? (
            /* Surprised "O" mouth */
            <ellipse cx="32" cy="32" rx="5" ry="4" fill="#f25f6b" />
          ) : (
            /* Happy smile curve */
            <path d="M26 30 Q32 37 38 30" stroke="#2d2d3f" strokeWidth="2" strokeLinecap="round" fill="none" />
          )}

          {/* ── Blush Cheeks ── */}
          <ellipse cx="14" cy="28" rx="5" ry="3.5" fill="#ffb3c1" opacity="0.5" />
          <ellipse cx="50" cy="28" rx="5" ry="3.5" fill="#ffb3c1" opacity="0.5" />
        </svg>
      </motion.div>

      {/* ── Sparkle Stars ── */}
      <motion.div
        className="absolute pointer-events-none"
        style={{ top: -2, right: -2 }}
        animate={{
          scale: [0.6, 1, 0.6],
          rotate: [0, 180, 360],
          opacity: [0.4, 1, 0.4],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M7 0 L8.5 5.5 L14 7 L8.5 8.5 L7 14 L5.5 8.5 L0 7 L5.5 5.5 Z" fill="#fbbf24" />
        </svg>
      </motion.div>

      <motion.div
        className="absolute pointer-events-none"
        style={{ top: 6, left: -4 }}
        animate={{
          scale: [0.5, 0.9, 0.5],
          rotate: [0, -200, -360],
          opacity: [0.3, 0.9, 0.3],
        }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
      >
        <svg width="10" height="10" viewBox="0 0 14 14">
          <path d="M7 0 L8.5 5.5 L14 7 L8.5 8.5 L7 14 L5.5 8.5 L0 7 L5.5 5.5 Z" fill="#a78bfa" />
        </svg>
      </motion.div>
    </motion.div>
  );
};

// ── Sparkle particle component ──────────────────────────────────────────────
const Particle: React.FC<{ delay: number; size: number; x: number; y: number }> = ({ delay, size, x, y }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      width: size,
      height: size,
      left: `calc(50% + ${x}px)`,
      top: `calc(50% + ${y}px)`,
      background: 'linear-gradient(135deg, #a78bfa, #818cf8, #c084fc)',
    }}
    initial={{ opacity: 0, scale: 0 }}
    animate={{
      opacity: [0, 1, 0],
      scale: [0, 1.2, 0],
      y: [0, -20 - Math.random() * 15],
      x: [0, (Math.random() - 0.5) * 30],
    }}
    transition={{
      duration: 2,
      delay,
      repeat: Infinity,
      repeatDelay: 1.5 + Math.random() * 2,
      ease: 'easeOut',
    }}
  />
);

// ── Floating ring pulse ─────────────────────────────────────────────────────
const PulseRing: React.FC<{ delay: number }> = ({ delay }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      inset: '-4px',
      border: '2px solid rgba(129, 140, 248, 0.35)',
      borderRadius: '9999px',
    }}
    initial={{ scale: 1, opacity: 0.5 }}
    animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
    transition={{
      duration: 2.8,
      delay,
      repeat: Infinity,
      ease: 'easeOut',
    }}
  />
);

// ── Main Floating Button ────────────────────────────────────────────────────
interface AIFloatingButtonProps {
  avoidChatComposer?: boolean;
}

export const AIFloatingButton: React.FC<AIFloatingButtonProps> = ({ avoidChatComposer = false }) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spring-based hover scale
  const hoverScale = useSpring(1, { stiffness: 400, damping: 25 });

  // Show tooltip hint after 4s if never interacted
  useEffect(() => {
    if (!hasInteracted) {
      tooltipTimer.current = setTimeout(() => setShowTooltip(true), 4000);
      return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); };
    }
  }, [hasInteracted]);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
    setHasInteracted(true);
    setShowTooltip(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Particles data — generated once
  const particles = useRef(
    Array.from({ length: 4 }, (_, i) => ({
      id: i,
      delay: i * 0.7,
      size: 3 + Math.random() * 3,
      x: (Math.random() - 0.5) * 70,
      y: (Math.random() - 0.5) * 70,
    }))
  ).current;

  const isDark = theme === 'dark';

  return (
    <>
      {/* ─── Floating Character Button ───────────────────────────── */}
      <div
        className="fixed z-[9998]"
        style={{
          bottom: avoidChatComposer
            ? 'calc(160px + env(safe-area-inset-bottom, 0px))'
            : 'calc(76px + env(safe-area-inset-bottom, 0px))',
          right: '8px',
        }}
        data-chat-composer-safe={avoidChatComposer ? 'true' : undefined}
      >
        {/* Tooltip bubble */}
        <AnimatePresence>
          {showTooltip && !isOpen && !avoidChatComposer && (
            <motion.div
              initial={{ opacity: 0, x: 10, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 10, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute right-full mr-1 top-1/2 -translate-y-1/2 whitespace-nowrap"
            >
              <div
                className="px-3 py-2 rounded-xl text-xs font-semibold shadow-lg backdrop-blur-md flex items-center gap-1.5"
                style={{
                  background: isDark
                    ? 'rgba(99, 102, 241, 0.9)'
                    : 'rgba(79, 70, 229, 0.9)',
                  color: '#fff',
                }}
              >
                <Sparkles className="w-3 h-3" />
                Hỏi TVU Buddy nè!
                {/* Arrow */}
                <div
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full"
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: '6px solid transparent',
                    borderBottom: '6px solid transparent',
                    borderLeft: isDark
                      ? '6px solid rgba(99, 102, 241, 0.9)'
                      : '6px solid rgba(79, 70, 229, 0.9)',
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pulse rings behind character */}
        {!isOpen && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <PulseRing delay={0} />
            <PulseRing delay={1.3} />
          </div>
        )}

        {/* Sparkle particles around character */}
        {!isOpen && (
          <div className="absolute inset-0 pointer-events-none">
            {particles.map(p => (
              <Particle key={p.id} {...p} />
            ))}
          </div>
        )}

        {/* The Character button */}
        <motion.button
          onClick={handleToggle}
          onHoverStart={() => hoverScale.set(1.15)}
          onHoverEnd={() => hoverScale.set(1)}
          whileTap={{ scale: 0.85 }}
          className="relative flex items-center justify-center focus:outline-none cursor-pointer"
          style={{
            scale: hoverScale,
            width: 72,
            height: 72,
            filter: isDark
              ? 'drop-shadow(0 4px 12px rgba(129, 140, 248, 0.45)) drop-shadow(0 1px 3px rgba(0,0,0,0.3))'
              : 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.3)) drop-shadow(0 2px 4px rgba(0,0,0,0.08))',
          }}
          aria-label={isOpen ? 'Đóng trợ lý AI' : 'Mở trợ lý AI TVU Buddy'}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isOpen ? (
              /* ── Close button ──── */
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{
                  background: isDark
                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                    : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                }}
              >
                <X className="w-6 h-6 text-white" />
              </motion.div>
            ) : (
              /* ── Kawaii Character ──── */
              <motion.div
                key="character"
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                <KawaiiCharacter isDark={isDark} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ─── Chat Panel Overlay ──────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[9999]"
              style={{
                background: isDark
                  ? 'rgba(0, 0, 0, 0.6)'
                  : 'rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}
              onClick={handleClose}
            />

            {/* Chat Panel */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 30,
                mass: 0.8,
              }}
              className="fixed z-[10000] overflow-hidden"
              data-ai-panel
              style={{
                bottom: 'env(safe-area-inset-bottom, 0px)',
                right: 0,
                left: 0,
                height: '85dvh',
                maxHeight: '85dvh',
                borderTopLeftRadius: '20px',
                borderTopRightRadius: '20px',
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                background: isDark
                  ? 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)'
                  : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                boxShadow: isDark
                  ? '0 -8px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.2)'
                  : '0 -8px 48px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(229, 231, 235, 0.8)',
              }}
            >
              {/* Drag handle bar */}
              <div className="flex justify-center pt-2 pb-0">
                <div
                  className="w-10 h-1 rounded-full"
                  style={{
                    background: isDark
                      ? 'rgba(148, 163, 184, 0.4)'
                      : 'rgba(148, 163, 184, 0.5)',
                  }}
                />
              </div>

              {/* AI Assistant content */}
              <div className="h-full overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center h-full">
                      <div className="text-center">
                        <motion.div
                          className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                          style={{
                            background: isDark
                              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                              : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                          }}
                          animate={{ rotate: [0, 360] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        >
                          <Bot className="w-7 h-7 text-white" />
                        </motion.div>
                        <p
                          className="text-sm font-medium"
                          style={{ color: isDark ? '#94a3b8' : '#64748b' }}
                        >
                          Đang thức dậy TVU Buddy...
                        </p>
                      </div>
                    </div>
                  }
                >
                  <LazyAIAssistant />
                </Suspense>
              </div>
            </motion.div>

            {/* Desktop: wider panel */}
            <style>{`
              @media (min-width: 640px) {
                [data-ai-panel] {
                  left: auto !important;
                  right: 16px !important;
                  bottom: 16px !important;
                  width: 420px !important;
                  height: 600px !important;
                  max-height: 80vh !important;
                  border-radius: 20px !important;
                }
              }
            `}</style>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
