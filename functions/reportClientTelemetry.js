const { onCall } = require('firebase-functions/v2/https');
const { write } = require('firebase-functions/logger');

const ALLOWED_ORIGINS = [
  'https://tvuconnect.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const MAX_CONTEXT_KEYS = 24;
const MAX_REQUESTS_PER_MINUTE = 40;
const rateWindows = new Map();

const SENSITIVE_KEY_PATTERN = /authorization|cookie|credential|password|secret|token|email|phone|message(?:text)?|content/i;
const SAFE_EVENT_PATTERN = /^[a-z][a-z0-9_.:-]{1,63}$/;

function truncate(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength);
}

function redact(value, maxLength = 600) {
  return truncate(value, maxLength)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, '[google-key]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
}

function sanitizePrimitive(value) {
  if (typeof value === 'string') return redact(value, 500);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  return undefined;
}

function sanitizeContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  return Object.fromEntries(Object.entries(input)
    .slice(0, MAX_CONTEXT_KEYS)
    .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
    .map(([key, value]) => {
      const safeKey = truncate(key.replace(/[^a-zA-Z0-9_.-]/g, '_'), 64);
      const primitive = sanitizePrimitive(value);
      if (primitive !== undefined) return [safeKey, primitive];

      if (Array.isArray(value)) {
        return [safeKey, value.slice(0, 10)
          .map(sanitizePrimitive)
          .filter((entry) => entry !== undefined)];
      }

      if (value && typeof value === 'object') {
        return [safeKey, Object.fromEntries(Object.entries(value)
          .slice(0, 10)
          .filter(([nestedKey]) => !SENSITIVE_KEY_PATTERN.test(nestedKey))
          .map(([nestedKey, nestedValue]) => [
            truncate(nestedKey.replace(/[^a-zA-Z0-9_.-]/g, '_'), 64),
            sanitizePrimitive(nestedValue),
          ])
          .filter(([, nestedValue]) => nestedValue !== undefined))];
      }

      return [safeKey, null];
    }));
}

function sanitizeTelemetry(data = {}) {
  const requestedEventType = typeof data.eventType === 'string'
    ? data.eventType.toLowerCase().trim()
    : '';
  const eventType = SAFE_EVENT_PATTERN.test(requestedEventType)
    ? requestedEventType
    : 'client.invalid_event';
  const severity = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
    .includes(String(data.severity || '').toUpperCase())
    ? String(data.severity).toUpperCase()
    : 'INFO';

  return {
    eventType,
    severity,
    sessionId: truncate(data.sessionId, 96),
    handoffId: truncate(data.handoffId, 96),
    message: redact(data.message || eventType, 900),
    stack: redact(data.stack, 6_000),
    route: truncate(data.route, 300),
    userAgent: redact(data.userAgent, 600),
    browserContext: truncate(data.browserContext, 40),
    buildId: truncate(data.buildId, 100),
    online: data.online !== false,
    viewport: truncate(data.viewport, 40),
    context: sanitizeContext(data.context),
  };
}

function allowSession(sessionId) {
  const key = sessionId || 'missing-session';
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_REQUESTS_PER_MINUTE;
}

exports.reportClientTelemetry = onCall({
  cors: ALLOWED_ORIGINS,
  timeoutSeconds: 10,
  memory: '256MiB',
  maxInstances: 5,
}, async (request) => {
  const telemetry = sanitizeTelemetry(request.data);
  if (!allowSession(telemetry.sessionId)) return { accepted: false, reason: 'rate-limited' };

  write({
    severity: telemetry.severity,
    message: `[TVU web] ${telemetry.eventType}: ${telemetry.message}${telemetry.stack ? `\n${telemetry.stack}` : ''}`,
    telemetrySource: 'tvu-connect-web',
    ...telemetry,
    uid: request.auth?.uid || null,
    appCheck: request.app ? 'valid' : 'missing',
    receivedAt: new Date().toISOString(),
    serviceContext: {
      service: 'tvu-connect-web',
      version: telemetry.buildId || 'unknown',
    },
  });

  return { accepted: true };
});

exports.sanitizeTelemetry = sanitizeTelemetry;
exports.sanitizeContext = sanitizeContext;
