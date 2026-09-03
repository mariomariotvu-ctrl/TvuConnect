import { logger } from './logger';
// Error Tracking Utility for TVU Connect
// Production-ready error logging and monitoring

interface ErrorLog {
  message: string;
  stack?: string;
  timestamp: number;
  userAgent: string;
  url: string;
  userId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
}

class ErrorTracker {
  private errors: ErrorLog[] = [];
  private maxErrors = 50; // Keep last 50 errors in memory
  private endpoint = '/api/errors'; // Future API endpoint

  constructor() {
    this.setupGlobalHandlers();
  }

  private setupGlobalHandlers() {
    // Catch unhandled errors
    window.addEventListener('error', (event) => {
      this.logError({
        message: event.message,
        stack: event.error?.stack,
        severity: 'high',
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        severity: 'high',
        context: {
          promise: event.promise
        }
      });
    });
  }

  logError(error: {
    message: string;
    stack?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    context?: Record<string, any>;
    userId?: string;
  }) {
    const errorLog: ErrorLog = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: error.userId,
      severity: error.severity || 'medium',
      context: error.context
    };

    // Add to memory
    this.errors.push(errorLog);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('[ErrorTracker]', errorLog);
    }

    // Send to server in production (future implementation)
    if (import.meta.env.PROD) {
      this.sendToServer(errorLog);
    }

    // Store in localStorage for debugging
    this.storeLocally(errorLog);
  }

  private async sendToServer(error: ErrorLog) {
    try {
      // Future: Send to error tracking service (Sentry, LogRocket, etc.)
      // await fetch(this.endpoint, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(error)
      // });
      
      logger.log('[ErrorTracker] Would send to server:', error.message);
    } catch (err) {
      console.error('[ErrorTracker] Failed to send error:', err);
    }
  }

  private storeLocally(error: ErrorLog) {
    try {
      const stored = localStorage.getItem('tvu_errors');
      const errors = stored ? JSON.parse(stored) : [];
      errors.push(error);
      
      // Keep only last 20 errors
      if (errors.length > 20) {
        errors.shift();
      }
      
      localStorage.setItem('tvu_errors', JSON.stringify(errors));
    } catch (err) {
      console.error('[ErrorTracker] Failed to store locally:', err);
    }
  }

  getErrors(): ErrorLog[] {
    return [...this.errors];
  }

  clearErrors() {
    this.errors = [];
    localStorage.removeItem('tvu_errors');
  }

  // Get errors from localStorage
  getStoredErrors(): ErrorLog[] {
    try {
      const stored = localStorage.getItem('tvu_errors');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
}

// Singleton instance
export const errorTracker = new ErrorTracker();

// Helper function for manual error logging
export const logError = (
  message: string,
  options?: {
    stack?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    context?: Record<string, any>;
    userId?: string;
  }
) => {
  errorTracker.logError({
    message,
    ...options
  });
};

// Helper for Firebase errors
export const logFirebaseError = (
  operation: string,
  error: any,
  userId?: string
) => {
  errorTracker.logError({
    message: `Firebase ${operation} failed: ${error.message}`,
    stack: error.stack,
    severity: 'high',
    context: {
      operation,
      code: error.code,
      details: error.details
    },
    userId
  });
};
