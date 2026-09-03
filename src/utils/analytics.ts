import { logger } from './logger';
// Analytics Utility for TVU Connect
// Track user behavior and platform metrics

interface AnalyticsEvent {
  name: string;
  category: 'user' | 'matching' | 'chat' | 'post' | 'system';
  properties?: Record<string, any>;
  timestamp: number;
  userId?: string;
}

class Analytics {
  private events: AnalyticsEvent[] = [];
  private maxEvents = 100;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.trackPageView();
    this.setupAutoTracking();
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupAutoTracking() {
    // Track page visibility
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.track('page_hidden', 'system');
      } else {
        this.track('page_visible', 'system');
      }
    });

    // Track online/offline
    window.addEventListener('online', () => {
      this.track('connection_online', 'system');
    });

    window.addEventListener('offline', () => {
      this.track('connection_offline', 'system');
    });
  }

  track(
    eventName: string,
    category: 'user' | 'matching' | 'chat' | 'post' | 'system',
    properties?: Record<string, any>,
    userId?: string
  ) {
    const event: AnalyticsEvent = {
      name: eventName,
      category,
      properties: {
        ...properties,
        sessionId: this.sessionId,
        userAgent: navigator.userAgent,
        url: window.location.href
      },
      timestamp: Date.now(),
      userId
    };

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Log in development
    if (import.meta.env.DEV) {
      logger.log('[Analytics]', event);
    }

    // Send to analytics service in production
    if (import.meta.env.PROD) {
      this.sendToService(event);
    }
  }

  private async sendToService(event: AnalyticsEvent) {
    try {
      // Future: Send to Google Analytics, Mixpanel, etc.
      // gtag('event', event.name, event.properties);
      logger.log('[Analytics] Would send:', event.name);
    } catch (err) {
      console.error('[Analytics] Failed to send:', err);
    }
  }

  // Track page views
  trackPageView(page?: string) {
    this.track('page_view', 'system', {
      page: page || window.location.pathname
    });
  }

  // Track user actions
  trackUserAction(action: string, properties?: Record<string, any>, userId?: string) {
    this.track(action, 'user', properties, userId);
  }

  // Track matching events
  trackMatching(action: string, properties?: Record<string, any>, userId?: string) {
    this.track(action, 'matching', properties, userId);
  }

  // Track chat events
  trackChat(action: string, properties?: Record<string, any>, userId?: string) {
    this.track(action, 'chat', properties, userId);
  }

  // Track post events
  trackPost(action: string, properties?: Record<string, any>, userId?: string) {
    this.track(action, 'post', properties, userId);
  }

  // Get all events
  getEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  // Get events by category
  getEventsByCategory(category: AnalyticsEvent['category']): AnalyticsEvent[] {
    return this.events.filter(e => e.category === category);
  }

  // Get session metrics
  getSessionMetrics() {
    const now = Date.now();
    const firstEvent = this.events[0];
    const sessionDuration = firstEvent ? now - firstEvent.timestamp : 0;

    return {
      sessionId: this.sessionId,
      duration: sessionDuration,
      eventCount: this.events.length,
      categories: {
        user: this.getEventsByCategory('user').length,
        matching: this.getEventsByCategory('matching').length,
        chat: this.getEventsByCategory('chat').length,
        post: this.getEventsByCategory('post').length,
        system: this.getEventsByCategory('system').length
      }
    };
  }
}

// Singleton instance
export const analytics = new Analytics();

// Helper functions
export const trackEvent = (
  name: string,
  category: 'user' | 'matching' | 'chat' | 'post' | 'system',
  properties?: Record<string, any>,
  userId?: string
) => {
  analytics.track(name, category, properties, userId);
};

export const trackPageView = (page?: string) => {
  analytics.trackPageView(page);
};

export const trackUserAction = (action: string, properties?: Record<string, any>, userId?: string) => {
  analytics.trackUserAction(action, properties, userId);
};

export const trackMatching = (action: string, properties?: Record<string, any>, userId?: string) => {
  analytics.trackMatching(action, properties, userId);
};

export const trackChat = (action: string, properties?: Record<string, any>, userId?: string) => {
  analytics.trackChat(action, properties, userId);
};

export const trackPost = (action: string, properties?: Record<string, any>, userId?: string) => {
  analytics.trackPost(action, properties, userId);
};
