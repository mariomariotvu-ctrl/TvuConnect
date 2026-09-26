const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1']);

export function normalizeRemoteAddress(address: string | undefined): string {
  if (!address) return '';
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}

export function isLocalInspectorRequest(input: {
  remoteAddress?: string;
  host?: string;
  forwardedFor?: string | string[];
}): boolean {
  // Never trust a request that has passed through a proxy. This inspector is
  // intentionally available only to a browser running on the developer Mac.
  if (input.forwardedFor) return false;

  const remoteAddress = normalizeRemoteAddress(input.remoteAddress);
  if (!LOOPBACK_ADDRESSES.has(remoteAddress)) return false;

  const host = (input.host || '').trim().toLowerCase();
  return host === 'localhost'
    || host.startsWith('localhost:')
    || host === '127.0.0.1'
    || host.startsWith('127.0.0.1:')
    || host === '[::1]'
    || host.startsWith('[::1]:');
}
