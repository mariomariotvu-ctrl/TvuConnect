import { describe, expect, it } from 'vitest';
import { isLocalInspectorRequest, normalizeRemoteAddress } from './locationInspectorAccess';

describe('local location inspector access', () => {
  it('accepts only loopback browsers using a local hostname', () => {
    expect(isLocalInspectorRequest({ remoteAddress: '::1', host: 'localhost:3000' })).toBe(true);
    expect(isLocalInspectorRequest({ remoteAddress: '127.0.0.1', host: '127.0.0.1:3000' })).toBe(true);
    expect(isLocalInspectorRequest({ remoteAddress: '::ffff:127.0.0.1', host: 'localhost:3000' })).toBe(true);
  });

  it('rejects LAN clients, public hosts and proxied requests', () => {
    expect(isLocalInspectorRequest({ remoteAddress: '192.168.1.9', host: 'localhost:3000' })).toBe(false);
    expect(isLocalInspectorRequest({ remoteAddress: '127.0.0.1', host: 'tvuconnect.vercel.app' })).toBe(false);
    expect(isLocalInspectorRequest({
      remoteAddress: '127.0.0.1',
      host: 'localhost:3000',
      forwardedFor: '203.0.113.10',
    })).toBe(false);
  });

  it('normalizes IPv4-mapped loopback addresses', () => {
    expect(normalizeRemoteAddress('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });
});
