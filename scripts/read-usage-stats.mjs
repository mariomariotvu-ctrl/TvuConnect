#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { summarizeUsage } from './lib/usage-report.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => {
  const inline = args.find(v => v.startsWith(`--${key}=`));
  if (inline) return inline.slice(key.length + 3);
  const index = args.indexOf(`--${key}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
if (args.includes('--help')) {
  console.log('Đo thử TVU Connect (chỉ đọc Cloud Logging)\n\nnpm run stats:usage -- --since=24h [--json] [--limit=10000] [--project=tvu-connect-1dc97]\nKhoảng thời gian: 30m, 6h, 7d. Cần gcloud đã đăng nhập, có quyền Logs Viewer.');
  process.exit(0);
}
const since = option('since', '24h');
const duration = /^(\d+)(m|h|d)$/.exec(since);
const limit = Number(option('limit', '10000'));
if (!duration || Number(duration[1]) < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100000) {
  console.error('Khoảng thời gian phải là số dương + m/h/d; limit phải từ 1 đến 100000.');
  process.exit(1);
}
const end = new Date().toISOString();
const start = new Date(Date.parse(end) - Number(duration[1]) * ({ m: 60000, h: 3600000, d: 86400000 })[duration[2]]).toISOString();
try {
  const entries = JSON.parse(execFileSync('gcloud', ['logging', 'read',
    `jsonPayload.telemetrySource="tvu-connect-web" AND timestamp>="${start}" AND timestamp<="${end}"`,
    `--project=${option('project', 'tvu-connect-1dc97')}`, `--limit=${limit}`, '--order=desc', '--format=json',
  ], { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }));
  const report = { window: { start, end, timezone: 'Asia/Ho_Chi_Minh' }, ...summarizeUsage(entries, { limit }) };
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const local = date => new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const u = report.usage, d = report.diagnostics;
    console.log(`TVU CONNECT — BÁO CÁO ĐO THỬ\n${local(start)} → ${local(end)} (giờ Việt Nam)\n`);
    console.table(Object.entries({
      'Phiên đo được': u.observedSessions, 'Lượt xem trang': u.observedPageViews,
      'Phiên có đăng nhập': u.signedInSessions, 'Tỷ lệ phiên có đăng nhập (%)': u.signedInSessionPercent,
      'Phiên có thao tác thành công': u.sessionsWithCompletedAction,
      'Tỷ lệ phiên có thao tác thành công (%)': u.completedActionSessionPercent,
      'Tổng giây dùng trang': u.totalActiveSeconds, 'Giây dùng trung bình/phiên': u.averageActiveSecondsPerSession,
    }).map(([metric, value]) => ({ 'Chỉ số': metric, 'Kết quả': value ?? 'Chưa có dữ liệu đo' })));
    for (const [name, values] of Object.entries({ 'Nguồn theo phiên': u.sourcesBySession, 'Trang đã xem': u.pageViewsByRoute, 'Thao tác thành công': u.completedActions })) {
      if (Object.keys(values).length) { console.log(name); console.table(values); }
    }
    console.log(`Chẩn đoán riêng: ${d.logs} dòng log, ${d.sessionsWithDiagnostics} phiên có log; loại ${report.coverage.excludedLogs} dòng thử/không hợp lệ.`);
    console.log(`Chuyển trình duyệt: ${d.observedHandoffRequests} yêu cầu có mã; ${d.requestsWithRecordedArrival} có bước đến đích tương ứng được ghi nhận; ${d.observedStayedInWebview} mã có sự kiện ở lại WebView.`);
    if (report.coverage.possiblyTruncated) console.warn('CẢNH BÁO: Đã chạm giới hạn log. Đây là mẫu bị giới hạn, không phải tổng cả kỳ.');
    for (const note of report.caveats) console.log(`- ${note}`);
  }
} catch (error) {
  console.error('Không đọc được thống kê. Kiểm tra gcloud và quyền Logs Viewer; không có số liệu thay vì giả định bằng 0.');
  process.exitCode = 1;
}
