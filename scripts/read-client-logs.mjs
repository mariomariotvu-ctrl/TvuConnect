#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const inline = args.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);
const escapeFilter = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const normalizeSupportCode = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toUpperCase();

const durationMs = (value) => {
  const match = /^(\d+)(m|h|d)$/.exec(value);
  if (!match) throw new Error(`Khoảng thời gian không hợp lệ: ${value}. Ví dụ: 30m, 6h, 2d.`);
  const amount = Number(match[1]);
  return amount * ({ m: 60_000, h: 3_600_000, d: 86_400_000 })[match[2]];
};

if (hasFlag('help')) {
  console.log(`Đọc lỗi web TVU Connect từ Cloud Logging

Cách dùng:
  npm run logs:client -- --since=6h --limit=100
  npm run logs:client -- --zalo --errors
  npm run logs:client -- --handoff=<mã-handoff> --details
  npm run logs:client -- --session=<mã-session> --event=auth.handoff_failed
  npm run logs:client -- --code=<mã-hỗ-trợ> --details

Tuỳ chọn:
  --since=6h       Khoảng thời gian: m, h hoặc d (mặc định 24h)
  --limit=100      Số log tối đa
  --zalo           Chỉ thiết bị mở bằng Zalo
  --errors         Chỉ WARNING/ERROR/CRITICAL
  --session=...    Lọc theo phiên thiết bị
  --code=...       Lọc theo mã hỗ trợ người dùng gửi
  --handoff=...    Theo dõi một lần chuyển Zalo → Safari
  --event=...      Lọc loại sự kiện
  --details        In context và stack đầy đủ
  --project=...    Firebase project (mặc định tvu-connect-1dc97)`);
  process.exit(0);
}

const project = option('project', 'tvu-connect-1dc97');
const since = option('since', '24h');
const limit = Math.min(Math.max(Number(option('limit', '100')) || 100, 1), 1_000);
const timestamp = new Date(Date.now() - durationMs(since)).toISOString();
const supportCode = normalizeSupportCode(option('code'));

if (supportCode === 'MAHOTRO') {
  console.error('“MÃ_HỖ_TRỢ” chỉ là chữ mẫu. Hãy thay bằng mã thật hiển thị trên thiết bị, ví dụ: --code=AB12CD34EF');
  process.exit(1);
}

if (supportCode && !/^[A-Z0-9]{10}$/.test(supportCode)) {
  console.error('Mã hỗ trợ phải gồm đúng 10 chữ/số, ví dụ: --code=AB12CD34EF');
  process.exit(1);
}

const filters = [
  'jsonPayload.telemetrySource="tvu-connect-web"',
  `timestamp>="${timestamp}"`,
];

if (hasFlag('zalo')) filters.push('jsonPayload.browserContext="zalo-webview"');
if (hasFlag('errors')) filters.push('severity>=WARNING');
if (option('session')) filters.push(`jsonPayload.sessionId="${escapeFilter(option('session'))}"`);
if (supportCode) filters.push(`jsonPayload.context.supportCode="${escapeFilter(supportCode)}"`);
if (option('handoff')) filters.push(`jsonPayload.handoffId="${escapeFilter(option('handoff'))}"`);
if (option('event')) filters.push(`jsonPayload.eventType="${escapeFilter(option('event'))}"`);

let raw;
try {
  raw = execFileSync('gcloud', [
    'logging',
    'read',
    filters.join(' AND '),
    `--project=${project}`,
    `--limit=${limit}`,
    '--order=desc',
    '--format=json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
} catch {
  console.error('Không đọc được log. Hãy kiểm tra gcloud đã đăng nhập và có quyền Logs Viewer.');
  process.exit(1);
}

const entries = JSON.parse(raw || '[]');
if (!entries.length) {
  console.log(`Không có log phù hợp trong ${since} gần nhất.`);
  if (hasFlag('errors')) {
    console.log('Lưu ý: luồng Zalo bị ngắt thường là sự kiện INFO, không phải lỗi JavaScript. Hãy dùng: npm run logs:client -- --zalo --since=6h');
  }
  process.exit(0);
}

const rows = entries.map((entry) => {
  const payload = entry.jsonPayload || {};
  return {
    time: entry.timestamp,
    severity: entry.severity || payload.severity || 'INFO',
    event: payload.eventType || '',
    browser: payload.browserContext || '',
    route: payload.route || '',
    session: payload.sessionId || '',
    handoff: payload.handoffId || '',
    uid: payload.uid || 'anonymous',
    message: String(payload.message || '').split('\n')[0].slice(0, 140),
  };
});

console.table(rows);

const events = new Set(entries.map((entry) => entry.jsonPayload?.eventType).filter(Boolean));
if (hasFlag('zalo')) {
  console.log('\nNhận định tự động:');
  if (events.has('auth.handoff_failed')) {
    console.log('- TVU Connect đã ghi nhận thao tác chuyển khỏi Zalo bị lỗi ngay trên trang.');
  } else if (events.has('auth.handoff_arrived')) {
    if (events.has('auth.redirect_completed') || events.has('auth.handoff_reused_session')) {
      console.log('- Thiết bị đã ra trình duyệt ngoài và hoàn tất/khôi phục phiên đăng nhập.');
    } else if (events.has('auth.redirect_started')) {
      console.log('- Thiết bị đã đến trình duyệt ngoài và bắt đầu Firebase Auth, nhưng chưa thấy bước hoàn tất đăng nhập.');
    } else {
      console.log('- Thiết bị đã đến trình duyệt ngoài, nhưng chưa bắt đầu được Firebase Auth.');
    }
  } else if (events.has('auth.handoff_requested')) {
    console.log('- Zalo đã yêu cầu mở trình duyệt ngoài, nhưng chưa thấy Safari/Chrome tải URL chuyển tiếp.');
    console.log('- Đây là luồng chuyển ứng dụng bị ngắt hoặc quay lại Zalo, không phải lỗi JavaScript nên --errors có thể trống.');
  } else if (events.has('browser.restricted_webview_loaded')) {
    console.log('- Trang đang chạy trong Zalo WebView nhưng chưa ghi nhận thao tác mở trình duyệt ngoài.');
  }

  if (events.has('auth.handoff_stayed_in_webview')) {
    console.log('- Có ít nhất một lần thao tác vẫn ở lại Zalo WebView sau khi yêu cầu chuyển.');
  }
}

if (hasFlag('details')) {
  for (const entry of entries) {
    const payload = entry.jsonPayload || {};
    console.log(`\n[${entry.timestamp}] ${payload.eventType || 'client-event'}`);
    console.log(JSON.stringify({
      severity: entry.severity || payload.severity,
      sessionId: payload.sessionId,
      handoffId: payload.handoffId,
      uid: payload.uid,
      browserContext: payload.browserContext,
      userAgent: payload.userAgent,
      route: payload.route,
      viewport: payload.viewport,
      online: payload.online,
      buildId: payload.buildId,
      context: payload.context,
      message: payload.message,
      stack: payload.stack,
    }, null, 2));
  }
}
