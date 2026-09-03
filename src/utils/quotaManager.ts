import { logger } from './logger';
// Quota Manager - Prevent quota exceeded errors

class QuotaManager {
  private quotaExceeded = false;
  private retryAfter: number | null = null;

  isQuotaExceeded(): boolean {
    if (this.retryAfter && Date.now() < this.retryAfter) {
      return true;
    }
    return this.quotaExceeded;
  }

  setQuotaExceeded(retryAfterHours = 12) {
    this.quotaExceeded = true;
    this.retryAfter = Date.now() + (retryAfterHours * 60 * 60 * 1000);
    
    // Store in localStorage
    localStorage.setItem('quota_exceeded', 'true');
    localStorage.setItem('retry_after', this.retryAfter.toString());
  }

  clearQuotaExceeded() {
    this.quotaExceeded = false;
    this.retryAfter = null;
    localStorage.removeItem('quota_exceeded');
    localStorage.removeItem('retry_after');
  }

  checkStoredQuota() {
    const stored = localStorage.getItem('quota_exceeded');
    const retryAfter = localStorage.getItem('retry_after');
    
    if (stored === 'true' && retryAfter) {
      const retryTime = parseInt(retryAfter);
      if (Date.now() < retryTime) {
        this.quotaExceeded = true;
        this.retryAfter = retryTime;
        return true;
      } else {
        this.clearQuotaExceeded();
      }
    }
    return false;
  }

  getRetryTime(): Date | null {
    if (this.retryAfter) {
      return new Date(this.retryAfter);
    }
    return null;
  }
}

export const quotaManager = new QuotaManager();

// Check on init
quotaManager.checkStoredQuota();

// Helper to wrap Firestore writes
export const safeWrite = async <T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T | null> => {
  if (quotaManager.isQuotaExceeded()) {
    const retryTime = quotaManager.getRetryTime();
    logger.warn(
      `[QuotaManager] Skipping ${operationName} - quota exceeded until ${retryTime?.toLocaleString('vi-VN')}`
    );
    return null;
  }

  try {
    return await operation();
  } catch (error: any) {
    if (error.code === 'resource-exhausted' || error.message?.includes('Quota')) {
      console.error('[QuotaManager] Quota exceeded detected');
      quotaManager.setQuotaExceeded();
      throw error;
    }
    throw error;
  }
};
