const LOCAL_AUTH_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Firebase's OAuth helper must be served by a real Firebase auth host while
 * developing locally. Production may use the app domain when /__/auth/* is
 * transparently proxied to Firebase Hosting.
 */
export function resolveFirebaseAuthDomain(
  configuredAuthDomain: string | undefined,
  projectId: string | undefined,
  hostname = typeof window !== 'undefined' ? window.location.hostname : '',
): string | undefined {
  const configured = configuredAuthDomain?.trim();
  const normalizedProjectId = projectId?.trim();

  if (LOCAL_AUTH_HOSTS.has(hostname) && normalizedProjectId) {
    return `${normalizedProjectId}.firebaseapp.com`;
  }

  return configured || (normalizedProjectId ? `${normalizedProjectId}.firebaseapp.com` : undefined);
}
