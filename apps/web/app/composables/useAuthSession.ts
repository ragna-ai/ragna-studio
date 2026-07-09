import type { AuthSession } from '@repo/auth/client';

const AUTH_SESSION_STATE_KEY = 'auth-session';

/**
 * Result of a session fetch.
 * `ok: true` is authoritative: `session` is either the logged-in session or
 * `null` when the server confirmed there is no session (logged out).
 * `ok: false` means the request itself failed (network/infra error). This is
 * NOT authoritative and must never be treated as "logged out".
 */
type AuthSessionFetchResult =
  | { ok: true; session: AuthSession | null }
  | { ok: false };

function useAuthSessionState() {
  return useState<AuthSession | null>(AUTH_SESSION_STATE_KEY, () => null);
}

/**
 * Fetches the session from the auth server. Does not touch shared state.
 */
export async function getAuthSession(): Promise<AuthSessionFetchResult> {
  const authClient = useAuth();

  try {
    const result = await authClient.getSession();
    return { ok: true, session: result.data ?? null };
  } catch {
    return { ok: false };
  }
}

/**
 * Fetches the session and writes it into the shared state.
 * This is the only function allowed to write the session. It is meant to be
 * called by the global auth middleware, never by components.
 */
export async function refreshAuthSession(): Promise<AuthSessionFetchResult> {
  const result = await getAuthSession();

  if (result.ok) {
    useAuthSessionState().value = result.session;
  }

  return result;
}

/**
 * Read-only access to the current auth session.
 * Never fetches. The global middleware is the single source of truth writer.
 */
export function useAuthSession() {
  return readonly(useAuthSessionState());
}
