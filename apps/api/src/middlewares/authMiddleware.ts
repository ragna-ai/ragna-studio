import type { AuthSession } from '@repo/auth/server';
import { auth } from '@repo/auth/server';
import { createMiddleware } from 'hono/factory';
import { UnauthorizedException } from '../exceptions';

export type AuthEnv = {
  Variables: {
    session: AuthSession;
  };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session || !session.user) {
    throw new UnauthorizedException();
  }

  c.set('session', session);
  // c.set('user', session.user);
  await next();
});
