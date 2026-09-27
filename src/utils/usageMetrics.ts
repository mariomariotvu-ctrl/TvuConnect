/** Coarse, allowlisted routes: never send conversation/profile identifiers. */
export function usageRoute(pathname: string): string {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (/^\/messages\/.+/.test(path)) return '/messages/:id';
  return /^(\/|\/(profile|friends|match-result|settings|community|library|notifications|messages|connect|explore)|\/connect\/(lover|study|quick|hobby)|\/explore\/(map|people|list|food|ai|rental))$/.test(path)
    ? path : '/other';
}

export function usageSource(search: string, referrer: string, browser: string) {
  const params = new URLSearchParams(search);
  const tag = params.get('utm_source')?.toLowerCase();
  const taggedSource = ['facebook', 'zalo', 'qr', 'instagram'].includes(tag || '') ? tag! : '';
  let referrerSource = '';
  try {
    const host = new URL(referrer).hostname;
    if (/(^|\.)facebook\.com$/.test(host)) referrerSource = 'facebook';
    else if (/(^|\.)zalo\.(me|com)$/.test(host)) referrerSource = 'zalo';
    else if (/(^|\.)google\.(com|com\.vn)$/.test(host)) referrerSource = 'google';
    else if (host !== 'tvuconnect.vercel.app') referrerSource = 'other-referral';
  } catch { /* Missing/blocked referrer is not proof of direct traffic. */ }
  return {
    // Keep campaign attribution separate from the actual browser context.
    source: taggedSource || referrerSource || (browser.endsWith('-webview') ? browser : 'direct-or-unknown'),
    attribution: taggedSource ? 'utm-tag' : referrerSource ? 'referrer' : 'browser-or-unknown',
    campaign: params.get('utm_campaign') === 'tvu_connect_join' ? 'tvu_connect_join' : '',
  };
}

/** Only count foreground time, with at most 60 seconds since the last input. */
export class UsageClock {
  totalMs = 0;
  private lastTick: number;
  private lastInput: number;
  private foreground: boolean;

  constructor(now: number, foreground: boolean) {
    this.lastTick = this.lastInput = now;
    this.foreground = foreground;
  }

  tick(now: number) {
    const elapsed = now - this.lastTick;
    // A suspended device/background timer cannot produce a long usage interval.
    if (this.foreground && elapsed >= 0 && elapsed <= 30_000) {
      this.totalMs += Math.max(0, Math.min(now, this.lastInput + 60_000) - this.lastTick);
    }
    this.lastTick = now;
    return this.totalMs;
  }

  input(now: number) { this.tick(now); this.lastInput = now; }
  setForeground(now: number, foreground: boolean) {
    this.tick(now);
    this.foreground = foreground;
    if (foreground) this.lastInput = now;
  }
}

export const USAGE_SESSION_IDLE_MS = 30 * 60_000;
export const USAGE_ACTIONS = ['message_sent', 'study_room_joined', 'profile_completed'] as const;
export type UsageAction = typeof USAGE_ACTIONS[number];
