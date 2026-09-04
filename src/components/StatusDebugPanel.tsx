/**
 * StatusDebugPanel Component — DEV ONLY
 * 
 * Hiển thị debug info cho User Activity Status system.
 * Chỉ render trong development mode (import.meta.env.DEV).
 * 
 * Usage: Thêm <StatusDebugPanel userId={currentUserId} /> vào App.tsx trong DEV mode.
 * 
 * Requirements: 9.5 (Task 14.3 — Developer Tools)
 */

import React, { useEffect, useState } from 'react';
import { StatusManager } from '../utils/userStatusManager';
import { HealthStatus } from '../utils/statusMetrics';

interface StatusDebugPanelProps {
  /** User ID để hiển thị debug info */
  userId: string | null | undefined;
  /** Có hiển thị panel mặc định không */
  defaultVisible?: boolean;
}

interface DebugInfo {
  healthStatus: HealthStatus;
  connectionId: string;
  connectionStatus: {
    connected: boolean;
    lastKnownStatus: string | null;
    queuedUpdates: number;
  };
  currentStatus: string;
}

/**
 * Developer Debug Panel cho User Activity Status system.
 * Chỉ render trong DEV mode.
 */
export const StatusDebugPanel: React.FC<StatusDebugPanelProps> = ({
  userId,
  defaultVisible = false,
}) => {
  const [visible, setVisible] = useState(defaultVisible);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<string>('');

  // Chỉ render trong DEV
  if (!import.meta.env.DEV) return null;

  // Poll debug info từ window.__presenceManager
  useEffect(() => {
    if (!visible || !userId) return;

    const poll = () => {
      const manager = (window as any).__presenceManager as StatusManager | undefined;
      if (!manager) return;

      try {
        const info: DebugInfo = {
          healthStatus: manager.getHealthStatus(),
          connectionId: manager.getConnectionId(),
          connectionStatus: manager.getConnectionStatus(),
          currentStatus: manager.getStatusForDisplay(),
        };
        setDebugInfo(info);
      } catch (_) {
        // Ignore
      }
    };

    poll(); // Immediate
    const interval = setInterval(poll, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, [visible, userId]);

  // Manual status override for testing
  const handleOverride = async () => {
    const manager = (window as any).__presenceManager as StatusManager | undefined;
    if (!manager || !overrideStatus) return;

    const validStatuses = ['online', 'away', 'offline'] as const;
    if (validStatuses.includes(overrideStatus as any)) {
      await manager.setStatus(overrideStatus as 'online' | 'away' | 'offline');
      setOverrideStatus('');
    }
  };

  // Toggle debug mode
  const toggleDebugMode = () => {
    const manager = (window as any).__presenceManager as StatusManager | undefined;
    if (manager) {
      manager.setDebugMode(true);
      console.debug('[StatusDebugPanel] Debug mode enabled on StatusManager');
    }
  };

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 9999,
          padding: '6px 12px',
          backgroundColor: '#4f46e5',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontSize: 12,
          cursor: 'pointer',
          opacity: 0.8,
        }}
      >
        🟢 Status Debug
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 9999,
        width: 320,
        backgroundColor: '#1e1e2e',
        color: '#cdd6f4',
        borderRadius: 8,
        padding: 16,
        fontSize: 12,
        fontFamily: 'monospace',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        border: '1px solid #313244',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, color: '#cba6f7' }}>🟢 Status Debug Panel</span>
        <button
          onClick={() => setVisible(false)}
          style={{ background: 'none', border: 'none', color: '#f38ba8', cursor: 'pointer', fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      {/* User ID */}
      <div style={{ marginBottom: 8, color: '#a6e3a1' }}>
        <strong>User:</strong> {userId || 'not authenticated'}
      </div>

      {/* Debug Info */}
      {debugInfo ? (
        <>
          <div style={{ marginBottom: 4 }}>
            <strong>Status:</strong>{' '}
            <span style={{
              color: debugInfo.currentStatus === 'online' ? '#a6e3a1'
                : debugInfo.currentStatus === 'away' ? '#fab387'
                : '#585b70'
            }}>
              {debugInfo.currentStatus}
            </span>
          </div>

          <div style={{ marginBottom: 4 }}>
            <strong>Connection:</strong>{' '}
            <span style={{ color: debugInfo.connectionStatus.connected ? '#a6e3a1' : '#f38ba8' }}>
              {debugInfo.connectionStatus.connected ? 'connected' : 'disconnected'}
            </span>
          </div>

          <div style={{ marginBottom: 4 }}>
            <strong>Queued updates:</strong> {debugInfo.connectionStatus.queuedUpdates}
          </div>

          <div style={{ marginBottom: 4 }}>
            <strong>Connection ID:</strong>{' '}
            <span style={{ fontSize: 10, color: '#7f849c' }}>{debugInfo.connectionId}</span>
          </div>

          <hr style={{ borderColor: '#313244', margin: '8px 0' }} />

          <div style={{ marginBottom: 4, color: '#cba6f7' }}><strong>Metrics</strong></div>
          <div style={{ marginBottom: 4 }}>
            <strong>Healthy:</strong>{' '}
            <span style={{ color: debugInfo.healthStatus.healthy ? '#a6e3a1' : '#f38ba8' }}>
              {debugInfo.healthStatus.healthy ? 'yes' : 'NO'}
            </span>
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>Total updates:</strong> {debugInfo.healthStatus.metrics.totalUpdates}
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>Failed updates:</strong> {debugInfo.healthStatus.metrics.failedUpdateCount}
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>Consecutive failures:</strong> {debugInfo.healthStatus.consecutiveFailures}
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>Avg latency:</strong> {debugInfo.healthStatus.metrics.averageLatencyMs}ms
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>P95 latency:</strong> {debugInfo.healthStatus.metrics.p95LatencyMs}ms
          </div>
        </>
      ) : (
        <div style={{ color: '#7f849c' }}>
          {userId ? 'Waiting for StatusManager...' : 'No user authenticated'}
        </div>
      )}

      <hr style={{ borderColor: '#313244', margin: '8px 0' }} />

      {/* Manual Override */}
      <div style={{ marginBottom: 8, color: '#cba6f7' }}><strong>Manual Override</strong></div>
      <div style={{ display: 'flex', gap: 4 }}>
        <select
          value={overrideStatus}
          onChange={(e) => setOverrideStatus(e.target.value)}
          style={{
            flex: 1,
            padding: '4px 8px',
            backgroundColor: '#313244',
            color: '#cdd6f4',
            border: '1px solid #45475a',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          <option value="">Select status...</option>
          <option value="online">online</option>
          <option value="away">away</option>
          <option value="offline">offline</option>
        </select>
        <button
          onClick={handleOverride}
          style={{
            padding: '4px 10px',
            backgroundColor: '#89b4fa',
            color: '#1e1e2e',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Set
        </button>
      </div>

      {/* Toggle debug mode */}
      <button
        onClick={toggleDebugMode}
        style={{
          marginTop: 8,
          width: '100%',
          padding: '4px 8px',
          backgroundColor: '#313244',
          color: '#cdd6f4',
          border: '1px solid #45475a',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 11,
        }}
      >
        Enable verbose logging
      </button>
    </div>
  );
};

export default StatusDebugPanel;
