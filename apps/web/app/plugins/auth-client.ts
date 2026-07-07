import { createAppAuthClient } from '@repo/auth/client';

export default defineNuxtPlugin(() => {
  const {
    public: { apiBaseUrl },
  } = useRuntimeConfig();

  const authClient = createAppAuthClient({
    baseURL: apiBaseUrl,
    fetchOptions: { credentials: 'include' },
  });

  return { provide: { authClient } };
});
