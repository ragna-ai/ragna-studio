const AUTH_SESSION_ASYNC_KEY = 'auth-session';

type AuthClient = ReturnType<typeof useAuth>;
type AuthSession = Awaited<ReturnType<AuthClient['getSession']>>['data'] | null;

export async function getAuthSession(): Promise<AuthSession> {
  const authClient = useAuth();

  try {
    const result = await authClient.getSession();
    return result.data ?? null;
  } catch {
    return null;
  }
}

export async function refreshAuthSession() {
  const session = await getAuthSession();
  const { data } = useNuxtData<AuthSession>(AUTH_SESSION_ASYNC_KEY);
  data.value = session;
  return session;
}

export function clearAuthSession() {
  const { data } = useNuxtData<AuthSession>(AUTH_SESSION_ASYNC_KEY);
  data.value = null;
}

export function useAuthSession() {
  return useAsyncData<AuthSession>(
    AUTH_SESSION_ASYNC_KEY,
    () => getAuthSession(),
    { default: () => null },
  );
}
