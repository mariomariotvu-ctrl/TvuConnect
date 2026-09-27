import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';

export type ClientSeverity = 'low' | 'medium' | 'high' | 'critical';
type DiagnosticValue = string | number | boolean | null | DiagnosticValue[] | {
  [key: string]: DiagnosticValue;
};

export interface ErrorLog {
  eventType: string;
  message: string;
  stack?: string;
  timestamp: number;
  userAgent: string;
  route: string;
  sessionId: string;
  userId?: string;
  severity: ClientSeverity;
  context?: Record<string, DiagnosticValue>;
}

interface ClientTelemetryPayload {
  eventType: string;
  message: string;
  stack?: string;
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  sessionId: string;
  handoffId?: string;
  route: string;
  userAgent: string;
  browserContext: string;
  buildId: string;
  online: boolean;
  viewport: string;
  context?: Record<string, DiagnosticValue>;
}

const LOCAL_STORAGE_KEY = 'tvu_client_diagnostics';
const SESSION_STORAGE_KEY = 'tvu_diagnostic_session_id';
const MAX_LOCAL_ERRORS = 20;
const MAX_MEMORY_ERRORS = 50;
const MAX_DUPLICATES_PER_MINUTE = 3;
const SEND_TIMEOUT_MS = 5_000;
const PRIVATE_CONTEXT_KEY = /authorization|cookie|credential|password|secret|token|email|phone|message(?:text)?|content/i;

const truncate = (value: unknown, length: number): string => (
  typeof value === 'string' ? value.slice(0, length) : String(value ?? '').slice(0, length)
);

const stripUrlDetails = (value: string): string => {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return truncate(value.split(/[?#]/)[0], 300);
  }
};

const safeDiagnosticValue = (value: unknown, depth = 0): DiagnosticValue | undefined => {
  if (typeof value === 'string') return truncate(value, 500);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (value === null) return null;
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) {
    return value.slice(0, 10)
      .map((entry) => safeDiagnosticValue(entry, depth + 1))
      .filter((entry): entry is DiagnosticValue => entry !== undefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .filter(([key]) => !PRIVATE_CONTEXT_KEY.test(key))
      .map(([key, entry]) => [key, safeDiagnosticValue(entry, depth + 1)])
      .filter((entry): entry is [string, DiagnosticValue] => entry[1] !== undefined));
  }
  return undefined;
};

const sanitizeContext = (context?: Record<string, unknown>): Record<string, DiagnosticValue> => (
  Object.fromEntries(Object.entries(context || {})
    .slice(0, 24)
    .filter(([key]) => !PRIVATE_CONTEXT_KEY.test(key))
    .map(([key, value]) => [key, safeDiagnosticValue(value)])
    .filter((entry): entry is [string, DiagnosticValue] => entry[1] !== undefined))
);

export const detectBrowserContext = (userAgent = navigator.userAgent): string => {
  if (/Zalo/i.test(userAgent)) return 'zalo-webview';
  if (/FBAN|FBAV/i.test(userAgent)) return 'facebook-webview';
  if (/Instagram/i.test(userAgent)) return 'instagram-webview';
  if (/TikTok/i.test(userAgent)) return 'tiktok-webview';
  if (/Line/i.test(userAgent)) return 'line-webview';
  if (/CriOS/i.test(userAgent)) return 'ios-chrome';
  if (/FxiOS/i.test(userAgent)) return 'ios-firefox';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios-safari';
  if (/Android/i.test(userAgent)) return 'android-browser';
  return 'desktop-browser';
};

const severityForServer = (severity: ClientSeverity): ClientTelemetryPayload['severity'] => {
  if (severity === 'critical') return 'CRITICAL';
  if (severity === 'high') return 'ERROR';
  if (severity === 'medium') return 'WARNING';
  return 'INFO';
};

const readOrCreateSessionId = (): string => {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
};

const reasonToError = (reason: unknown): { message: string; stack?: string } => {
  if (reason instanceof Error) return { message: reason.message, stack: reason.stack };
  if (typeof reason === 'string') return { message: reason };
  try {
    return { message: truncate(JSON.stringify(reason), 1_000) };
  } catch {
    return { message: truncate(reason, 1_000) };
  }
};

class ErrorTracker {
  private errors: ErrorLog[] = [];
  private sessionId = readOrCreateSessionId();
  private duplicateWindow = new Map<string, { count: number; startedAt: number }>();
  private report = httpsCallable<ClientTelemetryPayload, { accepted: boolean }>(
    functions,
    'reportClientTelemetry',
    { timeout: SEND_TIMEOUT_MS },
  );

  constructor() {
    this.setupGlobalHandlers();
    const browserContext = detectBrowserContext();
    if (browserContext.endsWith('-webview')) {
      this.trackEvent('browser.restricted_webview_loaded', {
        browserContext,
        referrerOrigin: this.safeReferrerOrigin(),
      });
    }
  }

  private safeReferrerOrigin(): string {
    if (!document.referrer) return '';
    try {
      return new URL(document.referrer).origin;
    } catch {
      return '';
    }
  }

  private setupGlobalHandlers() {
    window.addEventListener('error', (event) => {
      const errorEvent = event as ErrorEvent;
      const resourceTarget = event.target;
      if (!errorEvent.message && resourceTarget instanceof HTMLElement) {
        const source = resourceTarget.getAttribute?.('src') || resourceTarget.getAttribute?.('href') || '';
        this.logError({
          eventType: 'resource.load_failed',
          message: `Không tải được tài nguyên ${resourceTarget.tagName || 'unknown'}`,
          severity: 'medium',
          context: { source: stripUrlDetails(source) },
        });
        return;
      }

      this.logError({
        eventType: 'javascript.uncaught_error',
        message: errorEvent.message || 'Unknown JavaScript error',
        stack: errorEvent.error?.stack,
        severity: 'high',
        context: {
          filename: stripUrlDetails(errorEvent.filename || ''),
          line: errorEvent.lineno,
          column: errorEvent.colno,
        },
      });
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
      const reason = reasonToError(event.reason);
      this.logError({
        eventType: 'javascript.unhandled_rejection',
        message: reason.message,
        stack: reason.stack,
        severity: 'high',
      });
    });
  }

  private shouldSend(eventType: string, message: string): boolean {
    const key = `${eventType}:${message.slice(0, 160)}`;
    const now = Date.now();
    const current = this.duplicateWindow.get(key);
    if (!current || now - current.startedAt >= 60_000) {
      this.duplicateWindow.set(key, { count: 1, startedAt: now });
      return true;
    }
    current.count += 1;
    return current.count <= MAX_DUPLICATES_PER_MINUTE;
  }

  private basePayload(log: ErrorLog): ClientTelemetryPayload {
    const connection = (navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }).connection;
    const context = sanitizeContext({
      language: navigator.language,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${window.screen.width}x${window.screen.height}`,
      displayMode: window.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : 'browser',
      connectionType: connection?.effectiveType || 'unknown',
      saveData: connection?.saveData === true,
      referrerOrigin: this.safeReferrerOrigin(),
      ...log.context,
    });
    const handoffId = typeof context.handoffId === 'string' ? context.handoffId : undefined;
    return {
      eventType: log.eventType,
      message: truncate(log.message, 900),
      stack: truncate(log.stack, 6_000) || undefined,
      severity: severityForServer(log.severity),
      sessionId: log.sessionId,
      handoffId,
      route: window.location.pathname,
      userAgent: truncate(navigator.userAgent, 600),
      browserContext: detectBrowserContext(),
      buildId: import.meta.env.VITE_APP_BUILD_ID
        || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA
        || 'web-production',
      online: navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
      context,
    };
  }

  private async sendToServer(error: ErrorLog) {
    if (!this.shouldSend(error.eventType, error.message)) return;
    try {
      await this.report(this.basePayload(error));
    } catch (reportingError) {
      if (import.meta.env.DEV) console.warn('[Client telemetry] report failed', reportingError);
    }
  }

  private storeLocally(error: ErrorLog) {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      const errors = stored ? JSON.parse(stored) as ErrorLog[] : [];
      errors.push(error);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(errors.slice(-MAX_LOCAL_ERRORS)));
    } catch {
      // Storage is optional in partitioned browsers such as Zalo.
    }
  }

  logError(error: {
    eventType?: string;
    message: string;
    stack?: string;
    severity?: ClientSeverity;
    context?: Record<string, unknown>;
    userId?: string;
  }) {
    const errorLog: ErrorLog = {
      eventType: error.eventType || 'client.reported_error',
      message: truncate(error.message, 1_000),
      stack: truncate(error.stack, 8_000) || undefined,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      route: window.location.pathname,
      sessionId: this.sessionId,
      userId: error.userId || auth.currentUser?.uid,
      severity: error.severity || 'medium',
      context: sanitizeContext(error.context),
    };

    this.errors.push(errorLog);
    if (this.errors.length > MAX_MEMORY_ERRORS) this.errors.shift();
    this.storeLocally(errorLog);
    if (import.meta.env.DEV) console.error('[ErrorTracker]', errorLog);
    if (import.meta.env.PROD) void this.sendToServer(errorLog);
  }

  trackEvent(eventType: string, context?: Record<string, unknown>) {
    const event: ErrorLog = {
      eventType,
      message: eventType,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      route: window.location.pathname,
      sessionId: this.sessionId,
      userId: auth.currentUser?.uid,
      severity: 'low',
      context: sanitizeContext(context),
    };
    if (import.meta.env.DEV) console.info('[Client telemetry]', event);
    if (import.meta.env.PROD) void this.sendToServer(event);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getErrors(): ErrorLog[] {
    return [...this.errors];
  }

  getStoredErrors(): ErrorLog[] {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      return stored ? JSON.parse(stored) as ErrorLog[] : [];
    } catch {
      return [];
    }
  }

  clearErrors() {
    this.errors = [];
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
}

export const errorTracker = new ErrorTracker();

export const trackClientEvent = (eventType: string, context?: Record<string, unknown>) => {
  errorTracker.trackEvent(eventType, context);
};

export const logError = (
  message: string,
  options?: {
    eventType?: string;
    stack?: string;
    severity?: ClientSeverity;
    context?: Record<string, unknown>;
    userId?: string;
  },
) => {
  errorTracker.logError({ message, ...options });
};

export const logFirebaseError = (operation: string, error: unknown, userId?: string) => {
  const firebaseError = error as { message?: string; stack?: string; code?: string; details?: unknown };
  errorTracker.logError({
    eventType: 'firebase.operation_failed',
    message: `Firebase ${operation} failed: ${firebaseError?.message || String(error)}`,
    stack: firebaseError?.stack,
    severity: 'high',
    context: {
      operation,
      code: firebaseError?.code || 'unknown',
      details: firebaseError?.details,
    },
    userId,
  });
};
