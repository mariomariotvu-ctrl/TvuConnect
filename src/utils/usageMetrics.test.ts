import { describe, expect, it } from 'vitest';
import { UsageClock, usageRoute, usageSource } from './usageMetrics';

describe('usage privacy and attribution', () => {
  it('does not send user identifiers, queries, or unknown paths', () => {
    expect(usageRoute('/messages/user-secret?text=private#section')).toBe('/messages/:id');
    expect(usageRoute('/explore/food/')).toBe('/explore/food');
    expect(usageRoute('/profile/private-id')).toBe('/other');
    expect(usageRoute('/library?q=private')).toBe('/library');
  });
  it('keeps campaign tags separate from actual browser context', () => {
    expect(usageSource('?utm_source=facebook&utm_campaign=tvu_connect_join', '', 'zalo-webview'))
      .toEqual({ source: 'facebook', attribution: 'utm-tag', campaign: 'tvu_connect_join' });
    expect(usageSource('?utm_source=private-person', '', 'ios-safari').source).toBe('direct-or-unknown');
    expect(usageSource('', 'https://m.facebook.com/some-private-post', 'ios-safari').source).toBe('facebook');
    expect(usageSource('', 'https://facebook.com.evil.test/', 'ios-safari').source).toBe('other-referral');
  });
});

describe('foreground engagement clock', () => {
  it('stops after 60s idle and does not include the idle gap when input resumes', () => {
    const clock = new UsageClock(0, true);
    for (let t = 10000; t <= 90000; t += 10000) clock.tick(t);
    expect(clock.totalMs).toBe(60000);
    clock.input(100000);
    expect(clock.tick(110000)).toBe(70000);
  });
  it('ignores hidden/unfocused tabs', () => {
    const clock = new UsageClock(0, true);
    clock.setForeground(5000, false);
    clock.tick(20000);
    clock.setForeground(30000, true);
    expect(clock.tick(35000)).toBe(10000);
  });
  it('does not count a suspended device or backward system clock', () => {
    const clock = new UsageClock(0, true);
    clock.tick(120000);
    expect(clock.totalMs).toBe(0);
    clock.input(120000);
    expect(clock.tick(125000)).toBe(5000);
    expect(clock.tick(100000)).toBe(5000);
  });
});
