import { logger } from './logger';
// Performance Monitoring Utility for TVU Connect
// Track and optimize performance metrics

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  category: 'load' | 'render' | 'interaction' | 'network';
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 100;

  constructor() {
    this.setupObservers();
    this.trackInitialMetrics();
  }

  private setupObservers() {
    // Performance Observer for various metrics
    if ('PerformanceObserver' in window) {
      // Largest Contentful Paint (LCP)
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          this.recordMetric('LCP', lastEntry.renderTime || lastEntry.loadTime, 'load');
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        logger.warn('LCP observer not supported');
      }

      // First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            this.recordMetric('FID', entry.processingStart - entry.startTime, 'interaction');
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
      } catch (e) {
        logger.warn('FID observer not supported');
      }

      // Cumulative Layout Shift (CLS)
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              this.recordMetric('CLS', clsValue, 'render');
            }
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        logger.warn('CLS observer not supported');
      }
    }
  }

  private trackInitialMetrics() {
    // Wait for page load
    window.addEventListener('load', () => {
      setTimeout(() => {
        const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        
        if (perfData) {
          // DNS lookup time
          this.recordMetric(
            'DNS',
            perfData.domainLookupEnd - perfData.domainLookupStart,
            'network'
          );

          // TCP connection time
          this.recordMetric(
            'TCP',
            perfData.connectEnd - perfData.connectStart,
            'network'
          );

          // Time to First Byte (TTFB)
          this.recordMetric(
            'TTFB',
            perfData.responseStart - perfData.requestStart,
            'network'
          );

          // DOM Content Loaded
          this.recordMetric(
            'DCL',
            perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
            'load'
          );

          // Load Complete
          this.recordMetric(
            'Load',
            perfData.loadEventEnd - perfData.loadEventStart,
            'load'
          );

          // Total page load time
          this.recordMetric(
            'Total Load Time',
            perfData.loadEventEnd - perfData.fetchStart,
            'load'
          );
        }

        // First Contentful Paint (FCP)
        const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
        if (fcpEntry) {
          this.recordMetric('FCP', fcpEntry.startTime, 'render');
        }
      }, 0);
    });
  }

  recordMetric(
    name: string,
    value: number,
    category: 'load' | 'render' | 'interaction' | 'network'
  ) {
    const metric: PerformanceMetric = {
      name,
      value: Math.round(value * 100) / 100, // Round to 2 decimals
      timestamp: Date.now(),
      category
    };

    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log in development
    if (import.meta.env.DEV) {
      logger.log(`[Performance] ${name}: ${metric.value}ms`);
    }

    // Send to analytics in production
    if (import.meta.env.PROD) {
      this.sendToAnalytics(metric);
    }
  }

  private async sendToAnalytics(metric: PerformanceMetric) {
    try {
      // Future: Send to analytics service
      logger.log('[Performance] Would send:', metric);
    } catch (err) {
      console.error('[Performance] Failed to send:', err);
    }
  }

  // Measure custom operations
  measureOperation<T>(name: string, operation: () => T): T {
    const startTime = performance.now();
    const result = operation();
    const endTime = performance.now();
    
    this.recordMetric(name, endTime - startTime, 'interaction');
    
    return result;
  }

  // Measure async operations
  async measureAsyncOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    const result = await operation();
    const endTime = performance.now();
    
    this.recordMetric(name, endTime - startTime, 'interaction');
    
    return result;
  }

  // Get all metrics
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  // Get metrics by category
  getMetricsByCategory(category: PerformanceMetric['category']): PerformanceMetric[] {
    return this.metrics.filter(m => m.category === category);
  }

  // Get performance summary
  getSummary() {
    const loadMetrics = this.getMetricsByCategory('load');
    const renderMetrics = this.getMetricsByCategory('render');
    const interactionMetrics = this.getMetricsByCategory('interaction');
    const networkMetrics = this.getMetricsByCategory('network');

    const getAverage = (metrics: PerformanceMetric[]) => {
      if (metrics.length === 0) return 0;
      return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    };

    return {
      load: {
        count: loadMetrics.length,
        average: Math.round(getAverage(loadMetrics) * 100) / 100
      },
      render: {
        count: renderMetrics.length,
        average: Math.round(getAverage(renderMetrics) * 100) / 100
      },
      interaction: {
        count: interactionMetrics.length,
        average: Math.round(getAverage(interactionMetrics) * 100) / 100
      },
      network: {
        count: networkMetrics.length,
        average: Math.round(getAverage(networkMetrics) * 100) / 100
      }
    };
  }

  // Get Core Web Vitals
  getCoreWebVitals() {
    const lcp = this.metrics.find(m => m.name === 'LCP');
    const fid = this.metrics.find(m => m.name === 'FID');
    const cls = this.metrics.find(m => m.name === 'CLS');
    const fcp = this.metrics.find(m => m.name === 'FCP');
    const ttfb = this.metrics.find(m => m.name === 'TTFB');

    return {
      LCP: lcp ? { value: lcp.value, rating: this.rateLCP(lcp.value) } : null,
      FID: fid ? { value: fid.value, rating: this.rateFID(fid.value) } : null,
      CLS: cls ? { value: cls.value, rating: this.rateCLS(cls.value) } : null,
      FCP: fcp ? { value: fcp.value, rating: this.rateFCP(fcp.value) } : null,
      TTFB: ttfb ? { value: ttfb.value, rating: this.rateTTFB(ttfb.value) } : null
    };
  }

  private rateLCP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 2500) return 'good';
    if (value <= 4000) return 'needs-improvement';
    return 'poor';
  }

  private rateFID(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 100) return 'good';
    if (value <= 300) return 'needs-improvement';
    return 'poor';
  }

  private rateCLS(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 0.1) return 'good';
    if (value <= 0.25) return 'needs-improvement';
    return 'poor';
  }

  private rateFCP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 1800) return 'good';
    if (value <= 3000) return 'needs-improvement';
    return 'poor';
  }

  private rateTTFB(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value <= 800) return 'good';
    if (value <= 1800) return 'needs-improvement';
    return 'poor';
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Helper functions
export const measureOperation = <T>(name: string, operation: () => T): T => {
  return performanceMonitor.measureOperation(name, operation);
};

export const measureAsyncOperation = <T>(name: string, operation: () => Promise<T>): Promise<T> => {
  return performanceMonitor.measureAsyncOperation(name, operation);
};

export const getPerformanceMetrics = () => {
  return performanceMonitor.getMetrics();
};

export const getPerformanceSummary = () => {
  return performanceMonitor.getSummary();
};

export const getCoreWebVitals = () => {
  return performanceMonitor.getCoreWebVitals();
};
