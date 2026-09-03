import React, { useState, useEffect } from 'react';
import { Sun, Moon, Globe } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'motion/react';
import { logger } from '@/utils/logger';

export const SettingsBar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [currentLang, setCurrentLang] = useState('Việt');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for Google Translate to be ready
    const checkGoogleTranslate = setInterval(() => {
      // @ts-ignore
      const combo = document.querySelector('.goog-te-combo');
      if (combo) {
        setIsReady(true);
        clearInterval(checkGoogleTranslate);
        
        // Detect current language
        // @ts-ignore
        const currentCode = combo.value || 'vi';
        setCurrentLang(currentCode === 'en' ? 'English' : 'Việt');
        
        // Listen for language changes
        // @ts-ignore
        combo.addEventListener('change', (e) => {
          // @ts-ignore
          const newCode = e.target.value;
          setCurrentLang(newCode === 'en' ? 'English' : 'Việt');
        });
      }
    }, 500);

    setTimeout(() => clearInterval(checkGoogleTranslate), 10000);
    return () => clearInterval(checkGoogleTranslate);
  }, []);

  const handleLanguageToggle = () => {
    if (!isReady) {
      logger.log('Google Translate not ready yet');
      return;
    }

    // @ts-ignore
    const combo = document.querySelector('.goog-te-combo') as HTMLSelectElement;
    
    if (combo) {
      const newLang = combo.value === 'vi' ? 'en' : 'vi';
      logger.log('Changing language from', combo.value, 'to', newLang);
      combo.value = newLang;
      
      const event = new Event('change', { bubbles: true });
      combo.dispatchEvent(event);
      
      setCurrentLang(newLang === 'en' ? 'English' : 'Việt');
    } else {
      logger.log('Google Translate combo not found');
    }
  };

  return (
    <div className="flex items-stretch bg-white dark:bg-gray-800/80 dark:backdrop-blur-md border border-gray-100 dark:border-gray-700 rounded-full shadow-sm overflow-hidden h-10">
      {/* Theme Toggle - Left Half */}
      <button
        onClick={toggleTheme}
        className="flex items-center justify-center px-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-r border-gray-200 dark:border-gray-700"
        aria-label="Toggle theme"
      >
        <div className="relative w-11 h-5 bg-gray-200 dark:bg-indigo-900/40 rounded-full p-0.5 flex items-center">
          <motion.div
            className="absolute w-4 h-4 bg-white dark:bg-indigo-500 rounded-full shadow-sm"
            animate={{
              x: theme === 'dark' ? 22 : 0,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
          
          <div className="relative w-full flex justify-between items-center px-0.5">
            <Sun 
              className={`w-2.5 h-2.5 transition-colors ${
                theme === 'light' ? 'text-yellow-500' : 'text-gray-400'
              }`}
              strokeWidth={2.5}
            />
            <Moon 
              className={`w-2.5 h-2.5 transition-colors ${
                theme === 'dark' ? 'text-white' : 'text-gray-400'
              }`}
              strokeWidth={2.5}
            />
          </div>
        </div>
      </button>

      {/* Language Selector - Right Half */}
      <button
        onClick={handleLanguageToggle}
        disabled={!isReady}
        className={`flex items-center justify-center gap-1.5 px-3 transition-colors ${
          isReady 
            ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer' 
            : 'opacity-50 cursor-not-allowed'
        }`}
        aria-label="Change language"
        title={isReady ? 'Click to change language' : 'Loading...'}
      >
        <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" strokeWidth={2} />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {currentLang}
        </span>
      </button>
    </div>
  );
};
