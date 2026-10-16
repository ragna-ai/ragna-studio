/** CIMD client ids are HTTPS URLs to the client's metadata document; show only the host. */
export function clientHost(clientId: string): string {
  try {
    return new URL(clientId).host;
  } catch {
    return clientId;
  }
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface RedirectTarget {
  host: string;
  isLoopback: boolean;
}

/** Where the authorization code is sent. Null when the value is missing or not a URL. */
export function parseRedirectTarget(
  redirectUri: unknown,
): RedirectTarget | null {
  if (typeof redirectUri !== 'string') return null;
  try {
    const url = new URL(redirectUri);
    if (!url.host) return null;
    return { host: url.host, isLoopback: LOOPBACK_HOSTNAMES.has(url.hostname) };
  } catch {
    return null;
  }
}
