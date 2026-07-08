import { createAppAuthClient } from '@repo/auth/client';

export default defineNuxtPlugin(() => {
  const {
    public: { apiBaseUrl },
  } = useRuntimeConfig();

  const authClient = createAppAuthClient({
    baseURL: apiBaseUrl,
    basePath: '/auth',
    fetchOptions: { credentials: 'include' },
  });

  return { provide: { authClient } };
});
