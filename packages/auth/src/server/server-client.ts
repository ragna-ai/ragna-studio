import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({
  basePath: '/api/auth',
});

export type AuthSession = typeof authClient.$Infer.Session;
