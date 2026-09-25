import { describe, expect, it } from 'vitest';
import { resolveFirebaseAuthDomain } from './firebaseAuthDomain';

describe('resolveFirebaseAuthDomain', () => {
  it.each(['localhost', '127.0.0.1', '::1'])(
    'uses Firebase Hosting for local development on %s',
    (hostname) => {
      expect(resolveFirebaseAuthDomain(
        'tvuconnect.vercel.app',
        'tvu-connect-1dc97',
        hostname,
      )).toBe('tvu-connect-1dc97.firebaseapp.com');
    },
  );

  it('keeps the configured app domain in production', () => {
    expect(resolveFirebaseAuthDomain(
      'tvuconnect.vercel.app',
      'tvu-connect-1dc97',
      'tvuconnect.vercel.app',
    )).toBe('tvuconnect.vercel.app');
  });

  it('falls back to the Firebase Hosting domain when no auth domain is configured', () => {
    expect(resolveFirebaseAuthDomain(undefined, 'tvu-connect-1dc97', 'example.com'))
      .toBe('tvu-connect-1dc97.firebaseapp.com');
  });
});
