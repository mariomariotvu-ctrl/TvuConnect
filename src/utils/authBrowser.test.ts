import { describe, expect, it } from 'vitest';
import {
  buildExternalAuthBrowserUrl,
  isAppleMobileBrowser,
  isRestrictedAuthWebView,
} from './authBrowser';

describe('auth browser detection', () => {
  it.each([
    'Mozilla/5.0 Zalo/25.09.01 iPhone',
    'Mozilla/5.0 FBAN/FBIOS FBAV/500.0',
    'Mozilla/5.0 Instagram 400.0 Android',
    'Mozilla/5.0 TikTok 40.0',
    'Mozilla/5.0 Line/15.0',
  ])('blocks Google redirect login inside restricted webviews', (userAgent) => {
    expect(isRestrictedAuthWebView(userAgent)).toBe(true);
  });

  it('allows regular Safari and Chrome browsers', () => {
    expect(isRestrictedAuthWebView('Mozilla/5.0 iPhone Version/18.0 Mobile Safari/604.1'))
      .toBe(false);
    expect(isRestrictedAuthWebView('Mozilla/5.0 Android Chrome/140.0 Mobile Safari/537.36'))
      .toBe(false);
  });

  it('recognizes Apple mobile devices for the browser hint', () => {
    expect(isAppleMobileBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'))
      .toBe(true);
    expect(isAppleMobileBrowser('Mozilla/5.0 (Linux; Android 15) Chrome/140')).toBe(false);
  });

  it('launches Safari directly from an iPhone webview', () => {
    expect(buildExternalAuthBrowserUrl(
      'https://tvuconnect.vercel.app/explore/people',
      'Mozilla/5.0 iPhone Zalo/25.09',
    )).toBe('x-safari-https://tvuconnect.vercel.app/explore/people?externalAuth=google');
  });

  it('launches Chrome directly from an Android webview', () => {
    const target = buildExternalAuthBrowserUrl(
      'https://tvuconnect.vercel.app/',
      'Mozilla/5.0 Android 15 Zalo/25.09',
    );
    expect(target).toContain('intent://tvuconnect.vercel.app/?externalAuth=google#Intent;scheme=https;');
    expect(target).toContain('package=com.android.chrome');
  });
});
