import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import { detectBrowserContext } from './errorTracking';
import { UsageClock, usageRoute, usageSource, USAGE_SESSION_IDLE_MS, type UsageAction } from './usageMetrics';

const STORAGE_KEY = 'tvu_usage_session_v1';
const enabled = () => import.meta.env.PROD
  && window.location.origin === 'https://tvuconnect.vercel.app'
  && navigator.doNotTrack !== '1'
  && !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
  && !navigator.webdriver;
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
type Session = { id: string; lastInput: number; source: string; attribution: string; campaign: string };

/** Pilot, session-only measurement. No persistent visitor ID or cross-browser stitching. */
class UsageAnalytics {
  private session!: Session;
  private pageId = id();
  private path = '';
  private rawPath = '';
  private clock = new UsageClock(Date.now(), !document.hidden && document.hasFocus());
  private lastFlush = 0;
  private lastSentMs = 0;
  private lastPersist = 0;
  private signedIn = false;
  private browser = detectBrowserContext();
  private report = httpsCallable(functions, 'reportClientTelemetry', { timeout: 5_000 });

  constructor() {
    const now = Date.now();
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (stored && typeof stored.id === 'string' && stored.id.length <= 96
        && Number.isFinite(stored.lastInput) && now >= stored.lastInput
        && now - stored.lastInput < USAGE_SESSION_IDLE_MS) {
        // Only reuse our own known source labels, never arbitrary storage content.
        const sources = ['facebook', 'zalo', 'qr', 'instagram', 'google', 'other-referral',
          'zalo-webview', 'facebook-webview', 'instagram-webview', 'tiktok-webview', 'line-webview', 'direct-or-unknown'];
        this.session = { id: stored.id, lastInput: stored.lastInput,
          source: sources.includes(stored.source) ? stored.source : 'direct-or-unknown',
          attribution: ['utm-tag', 'referrer', 'browser-or-unknown'].includes(stored.attribution) ? stored.attribution : 'browser-or-unknown',
          campaign: stored.campaign === 'tvu_connect_join' ? stored.campaign : '' };
      }
    } catch { /* Private WebViews may block sessionStorage; use memory only. */ }
    if (!this.session) this.newSession(now);

    const input = () => this.activity();
    for (const type of ['pointerdown', 'keydown', 'scroll']) {
      window.addEventListener(type, input, { passive: true });
    }
    const visibility = () => {
      const foreground = !document.hidden && document.hasFocus();
      if (foreground) this.activity();
      this.clock.setForeground(Date.now(), foreground);
      if (!foreground) this.flush();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', visibility);
    window.addEventListener('blur', visibility);
    window.addEventListener('pagehide', () => this.flush());
    window.setInterval(() => {
      this.clock.tick(Date.now());
      if (Date.now() - this.lastFlush >= 30_000) this.flush();
    }, 10_000);
  }

  private persist() {
    this.lastPersist = Date.now();
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.session)); } catch { /* Memory fallback. */ }
  }

  private newSession(now: number) {
    this.session = { id: id(), lastInput: now,
      ...usageSource(window.location.search, document.referrer, this.browser) };
    this.persist();
    this.signedIn = false;
    this.send('session_started');
  }

  private activity() {
    const now = Date.now();
    if (now - this.session.lastInput >= USAGE_SESSION_IDLE_MS) {
      this.flush();
      this.pageId = id();
      this.clock = new UsageClock(now, !document.hidden && document.hasFocus());
      this.lastSentMs = 0;
      this.newSession(now);
      if (this.path) this.send('page_view');
      this.authentication(Boolean(auth.currentUser));
    }
    // Avoid a synchronous storage write on every scroll event.
    const shouldPersist = now - this.lastPersist >= 1_000;
    this.session.lastInput = now;
    this.clock.input(now);
    if (shouldPersist) this.persist();
  }

  private send(event: string, action?: UsageAction) {
    // Never block login/chat on telemetry. No offline replay: receivedAt is the report window.
    void this.report({
      eventType: `usage.${event}`, severity: 'INFO', sessionId: this.session.id,
      route: this.path || usageRoute(window.location.pathname), browserContext: this.browser,
      buildId: import.meta.env.VITE_APP_BUILD_ID || 'unknown',
      context: { schemaVersion: 1, environment: 'production', eventId: id(),
        pageId: this.pageId, activeMs: this.clock.totalMs,
        source: this.session.source, attribution: this.session.attribution,
        campaign: this.session.campaign, ...(action ? { action } : {}) },
    }).catch(() => undefined);
  }

  private flush() {
    const total = this.clock.tick(Date.now());
    this.lastFlush = Date.now();
    this.persist();
    if (this.path && total > this.lastSentMs) {
      this.send('engagement');
      this.lastSentMs = total;
    }
  }

  page(pathname: string) {
    const path = usageRoute(pathname);
    if (this.rawPath === pathname) return; // React StrictMode/double render is not another view.
    this.activity();
    this.flush();
    this.path = path;
    this.rawPath = pathname;
    this.pageId = id();
    this.clock = new UsageClock(Date.now(), !document.hidden && document.hasFocus());
    this.lastSentMs = 0;
    this.send('page_view');
  }

  authentication(signedIn: boolean) {
    if (signedIn && !this.signedIn) this.send('authenticated');
    this.signedIn = signedIn;
  }

  action(action: UsageAction) { this.activity(); this.send('action', action); }
}

let tracker: UsageAnalytics | undefined;
export function initializeUsageAnalytics() {
  try { if (!tracker && enabled()) tracker = new UsageAnalytics(); } catch { /* Measurement must not break the app. */ }
}
export function trackUsagePage(path: string) { try { tracker?.page(path); } catch { /* Best effort. */ } }
export function trackUsageAuthentication(signedIn: boolean) { try { tracker?.authentication(signedIn); } catch { /* Best effort. */ } }
export function trackUsageAction(action: UsageAction) { try { tracker?.action(action); } catch { /* Best effort. */ } }
