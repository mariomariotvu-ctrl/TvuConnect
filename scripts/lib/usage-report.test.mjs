import { describe, it, expect } from 'vitest';
import { summarizeUsage } from './usage-report.mjs';

const entry = (eventType, overrides = {}, context = {}) => ({
  timestamp: '2026-09-27T05:00:00Z',
  jsonPayload: { telemetrySource: 'tvu-connect-web', eventType, sessionId: 's1', route: '/library',
    browserContext: 'ios-safari', ...overrides,
    context: { schemaVersion: 1, environment: 'production', eventId: eventType, pageId: 'p1', activeMs: 0, source: 'facebook', ...context } },
});

describe('preliminary usage report', () => {
  it('never reports diagnostic sessions as traffic; missing measurements stay null', () => {
    const report = summarizeUsage([entry('javascript.uncaught_error'), entry('diagnostics.production_probe'), entry('diagnostic.test')]);
    expect(report.coverage.excludedLogs).toBe(2);
    expect(report.diagnostics.sessionsWithDiagnostics).toBe(1);
    expect(report.usage.observedSessions).toBeNull();
    expect(report.usage.averageActiveSecondsPerSession).toBeNull();
    expect(report.usage.returningVisitorRate).toBeNull();
  });
  it('deduplicates events and cumulative heartbeats; includes zero-second sessions', () => {
    const action = entry('usage.action', { uid: 'server-user' }, { eventId: 'action1', action: 'message_sent', activeMs: 60000 });
    const report = summarizeUsage([
      entry('usage.page_view'),
      entry('usage.engagement', {}, { eventId: 'h1', activeMs: 30000 }),
      action, action,
      entry('usage.engagement', {}, { eventId: 'h2', activeMs: 60000 }),
      entry('usage.page_view', { sessionId: 's2' }),
    ]);
    expect(report.usage.observedSessions).toBe(2);
    expect(report.usage.observedPageViews).toBe(2);
    expect(report.usage.totalActiveSeconds).toBe(60);
    expect(report.usage.averageActiveSecondsPerSession).toBe(30);
    expect(report.usage.signedInSessionPercent).toBe(50);
    expect(report.usage.completedActionSessionPercent).toBe(50);
    expect(report.usage.completedActions.message_sent).toBe(1);
    expect(JSON.stringify(report)).not.toContain('server-user');
  });
  it('is conservative when a page began before the reporting window', () => {
    const report = summarizeUsage([
      entry('usage.engagement', {}, { eventId: 'h1', activeMs: 120000 }),
      entry('usage.engagement', {}, { eventId: 'h2', activeMs: 150000 }),
    ]);
    expect(report.usage.totalActiveSeconds).toBe(30);
    expect(report.usage.observedPageViews).toBe(0);
  });
  it('matches handoff IDs across different browsers, not unrelated sessions', () => {
    const report = summarizeUsage([
      entry('auth.handoff_requested', { handoffId: 'h1', browserContext: 'zalo-webview' }),
      entry('auth.handoff_requested', { handoffId: 'h2', browserContext: 'zalo-webview' }),
      entry('auth.handoff_arrived', { handoffId: 'h1', sessionId: 'safari', browserContext: 'ios-safari' }),
      entry('auth.handoff_arrived', { handoffId: 'unrelated' }),
      entry('auth.handoff_requested', { handoffId: 'h1', browserContext: 'zalo-webview' }),
    ]);
    expect(report.diagnostics.observedHandoffRequests).toBe(2);
    expect(report.diagnostics.requestsWithRecordedArrival).toBe(1);
  });
  it('flags truncated data and excludes synthetic/dev measurement', () => {
    const report = summarizeUsage([
      entry('usage.page_view', {}, { synthetic: true }),
      entry('usage.page_view', {}, { environment: 'development' }),
      entry('usage.page_view', {}, { authenticated: true }),
    ], { limit: 3 });
    expect(report.coverage.possiblyTruncated).toBe(true);
    expect(report.usage.observedSessions).toBe(1);
    expect(report.usage.signedInSessions).toBe(0);
  });
});
