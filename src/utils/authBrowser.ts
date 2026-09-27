const RESTRICTED_AUTH_WEBVIEW_PATTERN = /Zalo|FBAN|FBAV|Instagram|TikTok|Line/i;

export function isRestrictedAuthWebView(userAgent?: string): boolean {
  const resolvedUserAgent = userAgent
    ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return RESTRICTED_AUTH_WEBVIEW_PATTERN.test(resolvedUserAgent);
}

export function isAppleMobileBrowser(userAgent?: string): boolean {
  const resolvedUserAgent = userAgent
    ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /iPhone|iPad|iPod/i.test(resolvedUserAgent);
}

export function shouldShowStartupSplash(restrictedWebView: boolean, authLoading: boolean, minimumElapsed: boolean): boolean {
  return !restrictedWebView && (authLoading || !minimumElapsed);
}

export function buildExternalAuthBrowserUrl(
  currentUrl: string,
  userAgent?: string,
  handoffId?: string,
): string {
  const httpsUrl = buildExternalAuthWebUrl(currentUrl, handoffId);
  const url = new URL(httpsUrl);
  const resolvedUserAgent = userAgent
    ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  if (/Android/i.test(resolvedUserAgent)) {
    const intentTarget = httpsUrl.replace(/^https?:\/\//, '');
    return `intent://${intentTarget}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`;
  }

  // iOS does not expose a supported "open Safari" URL scheme. Prefixes such
  // as x-safari-https:// make iOS look for a separate installed application
  // and show "App not found" on devices where that private scheme is absent.
  // target=_blank is NOT a Safari handoff guarantee: Facebook can open another
  // internal WebView. The UI must offer a copy/menu fallback, not an endless retry.
  return httpsUrl;
}

export function buildExternalAuthWebUrl(currentUrl: string, handoffId?: string): string {
  const url = new URL(currentUrl);
  // Copy only our navigation request, never OAuth state, credentials or arbitrary query parameters.
  url.search = '';
  url.hash = '';
  url.searchParams.set('externalAuth', 'google');
  if (handoffId) url.searchParams.set('handoffId', handoffId);
  return url.toString();
}

export function authWebViewName(userAgent = navigator.userAgent): string {
  if (/FBAN|FBAV/i.test(userAgent)) return 'Facebook / Messenger';
  if (/Zalo/i.test(userAgent)) return 'Zalo';
  if (/Instagram/i.test(userAgent)) return 'Instagram';
  if (/TikTok/i.test(userAgent)) return 'TikTok';
  return 'ứng dụng này';
}

export function createAuthHandoffId(): string {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function shouldStartExternalGoogleLogin(
  externalAuthRequest: string | null,
  hasAuthenticatedUser: boolean,
): boolean {
  return externalAuthRequest === 'google' && !hasAuthenticatedUser;
}
