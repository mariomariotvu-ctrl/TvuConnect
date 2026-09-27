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

Tuỳ chọn:
  --since=6h       Khoảng thời gian: m, h hoặc d (mặc định 24h)
  --limit=100      Số log tối đa
  --zalo           Chỉ thiết bị mở bằng Zalo
  --errors         Chỉ WARNING/ERROR/CRITICAL
  --session=...    Lọc theo phiên thiết bị
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
const filters = [
  'jsonPayload.telemetrySource="tvu-connect-web"',
  `timestamp>="${timestamp}"`,
];

if (hasFlag('zalo')) filters.push('jsonPayload.browserContext="zalo-webview"');
if (hasFlag('errors')) filters.push('severity>=WARNING');
if (option('session')) filters.push(`jsonPayload.sessionId="${escapeFilter(option('session'))}"`);
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
