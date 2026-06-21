import { createAuthClient } from '@repo/auth/client';

export function useAuth() {
  const url = useRequestURL();
  const headers = import.meta.server
    ? useRequestHeaders(['cookie'])
    : undefined;

  return createAuthClient({
    baseURL: url.origin,
    fetchOptions: { headers },
  });
}
