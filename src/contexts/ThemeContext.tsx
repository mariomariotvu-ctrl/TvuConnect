import React, { createContext, useContext, useState, useEffect } from 'react';
import { logger } from '@/utils/logger';

type Theme = 'light' | 'dark';
type ThemeMode = 'auto' | 'manual';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isAutoMode: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Helper function to determine theme based on time
const getAutoTheme = (): Theme => {
  const hour = new Date().getHours();
  // 6 AM (6h) to 6 PM (18h) = Light mode
  // 6 PM (18h) to 6 AM (6h) = Dark mode
  return (hour >= 6 && hour < 18) ? 'light' : 'dark';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check if user has manually set theme
    const themeMode = localStorage.getItem('tvu-connect-theme-mode') as ThemeMode;
    
    if (themeMode === 'manual') {
      // User has manually chosen, use their preference
      const savedTheme = localStorage.getItem('tvu-connect-theme') as Theme;
      return savedTheme || 'light';
    }
    
    // Auto mode: determine by time
    return getAutoTheme();
  });

  const [isAutoMode, setIsAutoMode] = useState<boolean>(() => {
    const themeMode = localStorage.getItem('tvu-connect-theme-mode') as ThemeMode;
    return themeMode !== 'manual';
  });

  // Auto-switch theme based on time (only in auto mode)
  useEffect(() => {
    if (!isAutoMode) return;

    const checkTime = () => {
      const autoTheme = getAutoTheme();
      if (theme !== autoTheme) {
        setTheme(autoTheme);
      }
    };

    // Check every minute
    const interval = setInterval(checkTime, 60000);
    
    // Check immediately
    checkTime();

    return () => clearInterval(interval);
  }, [isAutoMode, theme]);

  useEffect(() => {
    // CRITICAL: Ensure clean state before applying theme
    // Always remove dark class first to prevent conflicts
    document.documentElement.classList.remove('dark');
    
    // Apply theme to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
    
    // Save to localStorage
    localStorage.setItem('tvu-connect-theme', theme);
    
    // Debug log for mobile testing
    logger.log('[Theme Applied]', {
      theme,
      hasDarkClass: document.documentElement.classList.contains('dark'),
      classList: Array.from(document.documentElement.classList)
    });
  }, [theme]);

  const toggleTheme = () => {
    // When user manually toggles, switch to manual mode
    setIsAutoMode(false);
    localStorage.setItem('tvu-connect-theme-mode', 'manual');
    
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isAutoMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
