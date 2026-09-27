const USAGE_EVENTS = new Set(['usage.session_started', 'usage.page_view', 'usage.authenticated', 'usage.action', 'usage.engagement']);
const ACTIONS = new Set(['message_sent', 'study_room_joined', 'profile_completed']);
const countBy = (values) => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(v => v === value).length]));
const distinct = (values) => new Set(values.filter(Boolean));
const ratio = (n, d) => d ? Math.round(n / d * 1000) / 10 : null;

export function isProbe(payload) {
  return /^diagnostics?\./.test(payload.eventType || '')
    || payload.context?.synthetic === true || payload.context?.environment === 'test'
    || /^(probe|verify|test)([-_:]|$)/i.test(payload.sessionId || '')
    || /^(verification|probe|test)$/.test(payload.browserContext || '');
}

/** Only aggregates; never returns identifiers, raw UA, messages, or stack traces. */
export function summarizeUsage(entries, { limit = Infinity } = {}) {
  const valid = entries.filter(entry => entry.jsonPayload?.telemetrySource === 'tvu-connect-web' && !isProbe(entry.jsonPayload))
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const uniqueEvents = new Set();
  const usage = valid.filter(entry => {
    const p = entry.jsonPayload, c = p.context || {};
    if (!USAGE_EVENTS.has(p.eventType) || c.schemaVersion !== 1 || c.environment !== 'production'
      || !p.sessionId || !c.eventId || !c.pageId) return false;
    const key = `${p.sessionId}:${c.eventId}`;
    if (uniqueEvents.has(key)) return false;
    uniqueEvents.add(key);
    return true;
  });
  const sessions = new Map(), segments = new Map(), actions = [];
  for (const entry of usage) {
    const p = entry.jsonPayload, c = p.context;
    const session = sessions.get(p.sessionId) || { source: String(c.source || 'direct-or-unknown'), authenticated: false, meaningful: false };
    // Server-attached Firebase UID, not a boolean supplied by a client.
    if (p.uid) session.authenticated = true;
    if (p.eventType === 'usage.action' && ACTIONS.has(c.action)) {
      session.meaningful = true;
      actions.push(c.action);
    }
    sessions.set(p.sessionId, session);
    const key = `${p.sessionId}:${c.pageId}`;
    const ms = Number.isFinite(c.activeMs) ? Math.max(0, c.activeMs) : 0;
    const segment = segments.get(key) || { path: p.route, viewed: false, firstMs: ms, maxMs: 0 };
    if (p.eventType === 'usage.page_view') segment.viewed = true;
    segment.maxMs = Math.max(segment.maxMs, ms);
    segments.set(key, segment);
  }
  const allSessions = [...sessions.values()], allSegments = [...segments.values()];
  // A page already open before the report window has no page_view. Subtract its
  // first cumulative sample instead of counting engagement from before the window.
  const activeMs = allSegments.reduce((sum, s) => sum + Math.max(0, s.maxMs - (s.viewed ? 0 : s.firstMs)), 0);
  const signedIn = allSessions.filter(s => s.authenticated).length;
  const meaningful = allSessions.filter(s => s.meaningful).length;
  const diagnostic = valid.filter(e => !e.jsonPayload.eventType?.startsWith('usage.'));
  const handoffs = (event) => distinct(diagnostic.filter(e => e.jsonPayload.eventType === event).map(e => e.jsonPayload.handoffId));
  const requested = handoffs('auth.handoff_requested'), arrived = handoffs('auth.handoff_arrived');
  return {
    coverage: {
      rawLogs: entries.length, excludedLogs: entries.length - valid.length,
      possiblyTruncated: entries.length >= limit,
      firstRecordedAt: valid[0]?.timestamp || null, lastRecordedAt: valid.at(-1)?.timestamp || null,
      usageMeasurementAvailable: usage.length > 0,
      earliestUsageEventAt: usage[0]?.timestamp || null,
    },
    usage: {
      observedSessions: sessions.size || null,
      observedPageViews: usage.length ? allSegments.filter(s => s.viewed).length : null,
      signedInSessions: usage.length ? signedIn : null,
      signedInSessionPercent: ratio(signedIn, sessions.size),
      sessionsWithCompletedAction: usage.length ? meaningful : null,
      completedActionSessionPercent: ratio(meaningful, sessions.size),
      totalActiveSeconds: usage.length ? Math.round(activeMs / 1000) : null,
      averageActiveSecondsPerSession: sessions.size ? Math.round(activeMs / 1000 / sessions.size * 10) / 10 : null,
      uniquePeople: null, returningVisitorRate: null,
      sourcesBySession: countBy(allSessions.map(s => s.source)),
      pageViewsByRoute: countBy(allSegments.filter(s => s.viewed).map(s => s.path)),
      completedActions: countBy(actions),
    },
    diagnostics: {
      logs: diagnostic.length,
      sessionsWithDiagnostics: distinct(diagnostic.map(e => e.jsonPayload.sessionId)).size,
      events: countBy(diagnostic.map(e => e.jsonPayload.eventType)),
      eventsByBrowser: countBy(diagnostic.map(e => e.jsonPayload.browserContext)),
      observedHandoffRequests: requested.size,
      requestsWithRecordedArrival: [...requested].filter(id => arrived.has(id)).length,
      observedStayedInWebview: handoffs('auth.handoff_stayed_in_webview').size,
    },
    caveats: [
      'Số liệu quan sát, không phải toàn bộ lưu lượng; có thể gồm chủ app và bạn bè kiểm thử.',
      'Phiên có log chẩn đoán không phải tổng lượt truy cập hoặc số người dùng.',
      'Phiên đo thử theo tab, tách sau 30 phút không tương tác; không nối định danh Zalo với Safari.',
      'Có đăng nhập bao gồm khôi phục tài khoản cũ, không phải tỷ lệ đăng ký/đăng nhập mới.',
      'Thời gian chỉ tính khi trang hiện/focus và còn tương tác trong 60 giây; trung bình trên mọi phiên đo được, kể cả 0 giây.',
      'Heartbeat khoảng 30 giây. Đóng app, mất mạng, bị chặn hoặc tắt theo dõi có thể làm thiếu dữ liệu; mẫu vắt qua đầu kỳ được tính bảo thủ.',
      'UTM là nhãn chiến dịch: /join gắn nhãn Facebook dù người dùng có thể chuyển tiếp link qua Zalo.',
      'Không ghi nhận đích đến tương ứng chưa chứng minh chuyển trình duyệt thất bại; không dùng làm tỷ lệ lỗi toàn nền tảng.',
      'Chưa đo số người riêng biệt, tỷ lệ quay lại hay hiệu quả bài đăng khi chưa có dữ liệu tương ứng.',
    ],
  };
}
