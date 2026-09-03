import React from 'react';
import { motion } from 'motion/react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const sizeMap = {
    sm: {
      box: 'w-10 h-10',
      text: 'text-[12px]',
      radius: 'rounded-xl',
      innerRadius: 'rounded-[10px]',
      padding: 'p-[1.5px]'
    },
    md: {
      box: 'w-16 h-16',
      text: 'text-xl',
      radius: 'rounded-2xl',
      innerRadius: 'rounded-[14px]',
      padding: 'p-[1.5px]'
    },
    lg: {
      box: 'w-20 h-20 md:w-24 md:h-24',
      text: 'text-2xl md:text-3xl',
      radius: 'rounded-[1.2rem] md:rounded-[1.5rem]',
      innerRadius: 'rounded-[17px] md:rounded-[22px]',
      padding: 'p-[2px]'
    },
    xl: {
      box: 'w-24 h-24 md:w-32 md:h-32',
      text: 'text-3xl md:text-4xl',
      radius: 'rounded-[1.5rem] md:rounded-[2rem]',
      innerRadius: 'rounded-[20px] md:rounded-[28px]',
      padding: 'p-[2px]'
    },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={`flex items-center gap-3 md:gap-5 ${className} group cursor-pointer`}>
      {/* Logo Icon Box */}
      <div className={`${currentSize.box} ${currentSize.radius} bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-500 ${currentSize.padding} shadow-lg shadow-indigo-500/20 group-hover:shadow-violet-500/40 group-hover:scale-105 transition-all relative`}>
        <div className={`w-full h-full bg-white ${currentSize.innerRadius} flex items-center justify-center relative overflow-hidden shadow-inner`}>

          {/* Animated Student Network Nodes (Z-Pattern from user image) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-2">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <defs>
                {/* Glow filter for dark mode */}
                <filter id="glow-light" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                <filter id="glow-dark" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              
              {/* Nodes with stronger glow effect */}
              <motion.circle 
                cx="20" cy="25" r="5"
                className="fill-indigo-900 dark:fill-cyan-300"
                style={{ filter: 'url(#glow-dark)' }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.circle 
                cx="80" cy="20" r="5"
                className="fill-indigo-900 dark:fill-cyan-300"
                style={{ filter: 'url(#glow-dark)' }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              />
              <motion.circle 
                cx="20" cy="75" r="5"
                className="fill-indigo-900 dark:fill-cyan-300"
                style={{ filter: 'url(#glow-dark)' }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              />
              <motion.circle 
                cx="80" cy="80" r="5"
                className="fill-indigo-900 dark:fill-cyan-300"
                style={{ filter: 'url(#glow-dark)' }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              />

              {/* Z-Pattern Lines with stronger visibility */}
              <motion.line
                x1="20" y1="25" x2="80" y2="20"
                strokeWidth="3"
                className="stroke-indigo-900 dark:stroke-cyan-300"
                style={{ filter: 'url(#glow-dark)', opacity: 0.5 }}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
              />
              <motion.line
                x1="80" y1="20" x2="20" y2="75"
                strokeWidth="3"
                className="stroke-indigo-900 dark:stroke-cyan-300"
                style={{ filter: 'url(#glow-dark)', opacity: 0.5 }}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.5 }}
              />
              <motion.line
                x1="20" y1="75" x2="80" y2="80"
                strokeWidth="3"
                className="stroke-indigo-900 dark:stroke-cyan-300"
                style={{ filter: 'url(#glow-dark)', opacity: 0.5 }}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 1 }}
              />
            </svg>
          </div>

          {/* TVU Text - Size adjusted to never touch borders */}
          <span className={`font-black ${currentSize.text} bg-clip-text text-transparent bg-gradient-to-tr from-indigo-600 via-violet-600 to-blue-500 tracking-tight group-hover:scale-110 transition-transform duration-500 relative z-10 px-2`}>
            TVU
          </span>

          {/* Premium Shine Layer */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none"></div>
        </div>
      </div>

      {/* Brand Text */}
      {showText && (
        <span className={`
          logo-gradient-text font-black tracking-tight whitespace-nowrap transition-opacity
          ${size === 'sm' ? 'text-xl md:text-2xl' : ''}
          ${size === 'md' ? 'text-2xl md:text-3xl' : ''}
          ${size === 'lg' ? 'text-3xl md:text-5xl lg:text-6xl' : ''}
          ${size === 'xl' ? 'text-4xl md:text-6xl lg:text-7xl' : ''}
        `}
        >
          TVU Connect
        </span>
      )}
    </div>
  );
};
