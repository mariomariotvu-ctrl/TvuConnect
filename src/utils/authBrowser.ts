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

export function buildExternalAuthBrowserUrl(
  currentUrl: string,
  userAgent?: string,
): string {
  const url = new URL(currentUrl);
  url.searchParams.set('externalAuth', 'google');
  const httpsUrl = url.toString();
  const resolvedUserAgent = userAgent
    ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  if (/Android/i.test(resolvedUserAgent)) {
    const intentTarget = httpsUrl.replace(/^https?:\/\//, '');
    return `intent://${intentTarget}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`;
  }

  if (isAppleMobileBrowser(resolvedUserAgent)) {
    const safariScheme = url.protocol === 'http:' ? 'x-safari-http://' : 'x-safari-https://';
    return httpsUrl.replace(/^https?:\/\//, safariScheme);
  }

  return httpsUrl;
}
