import React from 'react';
import { Copy, ExternalLink, Check } from 'lucide-react';
import { authWebViewName, buildExternalAuthBrowserUrl, buildExternalAuthWebUrl, createAuthHandoffId } from '../utils/authBrowser';
import { getDiagnosticSupportCode, trackClientEvent } from '../utils/errorTracking';

/** Google OAuth must run in a supported browser, not an embedded Facebook/Zalo WebView. */
export function ExternalBrowserLogin() {
  const [handoffId] = React.useState(() => new URL(window.location.href).searchParams.get('handoffId') || createAuthHandoffId());
  const [attempted, setAttempted] = React.useState(() => new URL(window.location.href).searchParams.get('externalAuth') === 'google');
  const [copied, setCopied] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const android = /Android/i.test(navigator.userAgent);
  const appName = authWebViewName();
  const webUrl = buildExternalAuthWebUrl(window.location.href, handoffId);

  React.useEffect(() => {
    trackClientEvent('auth.external_browser_help_shown', { handoffId, appName });
  }, [handoffId, appName]);

  const selectLink = () => { inputRef.current?.focus(); inputRef.current?.select(); };
  const copy = async () => {
    setCopyFailed(false);
    let success = false;
    try { await navigator.clipboard.writeText(webUrl); success = true; } catch {
      // iOS in-app browsers sometimes deny the async Clipboard API.
      selectLink();
      try { success = document.execCommand('copy'); } catch { /* Keep selectable URL visible. */ }
    }
    setCopied(success);
    setCopyFailed(!success);
    if (success) trackClientEvent('auth.handoff_link_copied', { handoffId, appName });
  };

  return (
    <section className="w-full max-w-md rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left dark:border-indigo-800 dark:bg-indigo-950/40" aria-labelledby="external-login-title">
      <h2 id="external-login-title" className="text-base font-bold text-slate-950 dark:text-white">Đăng nhập bằng Safari hoặc Chrome</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        Bạn đang mở trong {appName}. Đăng nhập Google cần trình duyệt bên ngoài.
      </p>
      {android && !attempted && (
        <a href={buildExternalAuthBrowserUrl(window.location.href, undefined, handoffId)}
          onClick={() => {
            setAttempted(true);
            trackClientEvent('auth.handoff_requested', { handoffId, targetBrowser: 'chrome' });
          }}
          className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white">
          <ExternalLink className="h-5 w-5" aria-hidden="true" />Mở Chrome để đăng nhập
        </a>
      )}
      {attempted && <p role="status" className="mt-2 text-sm text-amber-800 dark:text-amber-200">Trang vẫn đang ở trong {appName}. Không cần bấm mở lại.</p>}
      <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        Bấm nút chia sẻ hoặc dấu ⋯ của {appName}, chọn <strong>Mở trong trình duyệt / Safari</strong> nếu có.
        Hoặc sao chép liên kết dưới đây rồi dán vào Safari/Chrome.
      </p>
      <button type="button" onClick={() => { void copy(); }}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700">
        {copied ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
        {copied ? 'Đã sao chép liên kết' : 'Sao chép liên kết đăng nhập'}
      </button>
      <input ref={inputRef} readOnly value={webUrl} aria-label="Liên kết đăng nhập TVU Connect"
        onClick={selectLink} className="mt-3 min-h-11 w-full rounded-lg border border-indigo-200 bg-white px-3 text-xs text-slate-700 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-200" />
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" role="status" aria-live="polite">
        {copyFailed ? 'Không thể tự sao chép. Nhấn giữ ô liên kết để chọn Sao chép.'
          : copied ? 'Mở Safari/Chrome và dán vào thanh địa chỉ. Tài khoản đã đăng nhập sẽ được giữ lại.' : 'Nếu đã đăng nhập ở trình duyệt ngoài, bạn không cần đăng nhập lại.'}
      </p>
      <p className="mt-3 text-xs text-slate-500">Mã hỗ trợ: {getDiagnosticSupportCode()}</p>
    </section>
  );
}
