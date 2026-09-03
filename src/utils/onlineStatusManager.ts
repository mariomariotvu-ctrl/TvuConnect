import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

class OnlineStatusManager {
  private updateInterval: NodeJS.Timeout | null = null;
  private lastUpdateTime: number = 0;
  private readonly UPDATE_INTERVAL = 3 * 60 * 1000; // 3 minutes to drastically save Firestore writes
  private readonly MIN_UPDATE_GAP = 60000; // 1 minute minimum between updates

  /**
   * Set user online status
   */
  async setOnline(userId: string): Promise<void> {
    const now = Date.now();
    
    // Debounce: Skip if updated recently
    if (now - this.lastUpdateTime < this.MIN_UPDATE_GAP) {
      return;
    }

    try {
      const userRef = doc(db, 'profiles', userId);
      await updateDoc(userRef, {
        isOnline: true,
        lastActive: serverTimestamp()
      });
      
      this.lastUpdateTime = now;
    } catch (error) {
      console.error('Error setting online status:', error);
    }
  }

  /**
   * Set user offline status
   */
  async setOffline(userId: string): Promise<void> {
    try {
      const userRef = doc(db, 'profiles', userId);
      await updateDoc(userRef, {
        isOnline: false,
        lastActive: serverTimestamp()
      });
    } catch (error) {
      console.error('Error setting offline status:', error);
    }
  }

  /**
   * Start heartbeat to keep status updated
   */
  startHeartbeat(userId: string): void {
    // Clear existing interval
    this.stopHeartbeat();

    // Initial update
    this.setOnline(userId);

    // Setup periodic updates
    this.updateInterval = setInterval(() => {
      // Only update if page is visible
      if (document.visibilityState === 'visible') {
        this.setOnline(userId);
      }
    }, this.UPDATE_INTERVAL);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Handle visibility change
   */
  handleVisibilityChange(userId: string): void {
    if (document.visibilityState === 'visible') {
      this.setOnline(userId);
    } else {
      // Debounce offline: chỉ set offline nếu tab vẫn ẩn sau 3 giây
      // Tránh flood writes khi user switch tab nhanh
      setTimeout(() => {
        if (document.visibilityState !== 'visible') {
          this.setOffline(userId);
        }
      }, 3000);
    }
  }

  /**
   * Cleanup on unmount
   */
  cleanup(userId: string): void {
    this.stopHeartbeat();
    this.setOffline(userId);
  }
}

export const onlineStatusManager = new OnlineStatusManager();
