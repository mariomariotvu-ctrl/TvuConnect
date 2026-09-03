import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'motion/react';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative w-12 h-7 md:w-14 md:h-8 bg-gray-200 dark:bg-indigo-900/40 rounded-full transition-colors duration-300 hover:bg-gray-300 dark:hover:bg-indigo-900/60"
      aria-label="Toggle theme"
    >
      {/* Sliding background */}
      <motion.div
        className="absolute w-6 h-6 md:w-6 md:h-6 bg-white dark:bg-indigo-500 rounded-full shadow-md"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
        }}
        animate={{
          left: theme === 'dark' ? 'calc(100% - 26px)' : '2px',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
      
      {/* Sun Icon - Left */}
      <div 
        className="absolute w-6 h-6 flex items-center justify-center z-10"
        style={{
          top: '50%',
          left: '2px',
          transform: 'translateY(-50%)',
        }}
      >
        <Sun 
          className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-colors ${
            theme === 'light' ? 'text-yellow-500' : 'text-gray-400 dark:text-gray-500'
          }`}
          strokeWidth={2.5}
        />
      </div>
      
      {/* Moon Icon - Right */}
      <div 
        className="absolute w-6 h-6 flex items-center justify-center z-10"
        style={{
          top: '50%',
          right: '2px',
          transform: 'translateY(-50%)',
        }}
      >
        <Moon 
          className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-colors ${
            theme === 'dark' ? 'text-white' : 'text-gray-400'
          }`}
          strokeWidth={2.5}
        />
      </div>
    </button>
  );
};
