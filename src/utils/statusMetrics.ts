/**
 * Status Metrics Utility
 *
 * Lightweight metrics tracking cho User Activity Status System.
 * Theo dõi online users count, update latency, và failed update count.
 * Expose health check thông qua getHealthStatus().
 *
 * Requirements: 9.2, 9.3
 */

export interface StatusMetricsSnapshot {
  onlineUsersCount: number;
  failedUpdateCount: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  totalUpdates: number;
  capturedAt: number; // Timestamp khi snapshot được tạo
}

export interface HealthStatus {
  healthy: boolean;
  metrics: StatusMetricsSnapshot;
  consecutiveFailures: number;
  lastUpdateAt: number | null;
  message: string;
}

/**
 * Số lượng latency samples tối đa lưu trong bộ nhớ
 * (tránh memory leak khi chạy lâu)
 */
const MAX_LATENCY_SAMPLES = 200;

/**
 * Ngưỡng consecutive failures để báo unhealthy
 */
const UNHEALTHY_FAILURE_THRESHOLD = 3;

export class StatusMetrics {
  private onlineUsersCount: number = 0;
  private failedUpdateCount: number = 0;
  private latencySamples: number[] = []; // mảng các latency values (ms)
  private totalUpdates: number = 0;
  private lastUpdateAt: number | null = null;
  private consecutiveFailures: number = 0;

  /**
   * Cập nhật số lượng user online hiện tại
   */
  setOnlineUsersCount(count: number): void {
    this.onlineUsersCount = Math.max(0, count);
  }

  /**
   * Tăng online users count thêm 1 (khi một user chuyển sang online)
   */
  incrementOnlineUsers(): void {
    this.onlineUsersCount = Math.max(0, this.onlineUsersCount + 1);
  }

  /**
   * Giảm online users count đi 1 (khi một user offline)
   */
  decrementOnlineUsers(): void {
    this.onlineUsersCount = Math.max(0, this.onlineUsersCount - 1);
  }

  /**
   * Ghi lại latency của một lần update thành công.
   * @param startTime - Timestamp (ms) khi bắt đầu write operation
   */
  recordUpdateLatency(startTime: number): void {
    const latencyMs = Date.now() - startTime;
    this.latencySamples.push(latencyMs);
    this.totalUpdates++;
    this.lastUpdateAt = Date.now();
    // Reset consecutive failures khi có update thành công
    this.consecutiveFailures = 0;

    // Giữ kích thước mảng trong giới hạn để tránh memory leak
    if (this.latencySamples.length > MAX_LATENCY_SAMPLES) {
      this.latencySamples.shift();
    }
  }

  /**
   * Tăng failed update count và consecutive failures
   */
  incrementFailedCount(): void {
    this.failedUpdateCount++;
    this.consecutiveFailures++;
  }

  /**
   * Reset consecutive failures count (gọi khi có thành công)
   */
  resetConsecutiveFailures(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Lấy số lần thất bại liên tiếp hiện tại
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Tính average latency từ các samples hiện có
   */
  private computeAverageLatency(): number {
    if (this.latencySamples.length === 0) return 0;
    const sum = this.latencySamples.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / this.latencySamples.length);
  }

  /**
   * Tính P95 latency (percentile 95) từ các samples hiện có
   */
  private computeP95Latency(): number {
    if (this.latencySamples.length === 0) return 0;
    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.95);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  /**
   * Lấy snapshot hiện tại của các metrics
   */
  getSnapshot(): StatusMetricsSnapshot {
    return {
      onlineUsersCount: this.onlineUsersCount,
      failedUpdateCount: this.failedUpdateCount,
      averageLatencyMs: this.computeAverageLatency(),
      p95LatencyMs: this.computeP95Latency(),
      totalUpdates: this.totalUpdates,
      capturedAt: Date.now(),
    };
  }

  /**
   * Expose health check endpoint (Requirements 9.3)
   * Trả về health status dựa trên consecutive failures và metrics hiện tại.
   */
  getHealthStatus(): HealthStatus {
    const metrics = this.getSnapshot();
    const healthy = this.consecutiveFailures < UNHEALTHY_FAILURE_THRESHOLD;

    let message: string;
    if (healthy) {
      message = 'Status system is operating normally.';
    } else {
      message = `Status system degraded: ${this.consecutiveFailures} consecutive failures detected.`;
    }

    return {
      healthy,
      metrics,
      consecutiveFailures: this.consecutiveFailures,
      lastUpdateAt: this.lastUpdateAt,
      message,
    };
  }

  /**
   * Reset tất cả metrics (hữu ích cho testing)
   */
  reset(): void {
    this.onlineUsersCount = 0;
    this.failedUpdateCount = 0;
    this.latencySamples = [];
    this.totalUpdates = 0;
    this.lastUpdateAt = null;
    this.consecutiveFailures = 0;
  }
}

/**
 * Singleton instance để share metrics giữa các StatusManager instances
 * trong cùng một browser session.
 */
export const globalStatusMetrics = new StatusMetrics();
