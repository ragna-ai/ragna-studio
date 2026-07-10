import { auth } from '@repo/auth/server';
import { createMiddleware } from 'hono/factory';
import { UnauthorizedException } from '../exceptions';

export type AuthEnv = {
  Variables: {
    user: typeof auth.$Infer.Session.user;
    session: typeof auth.$Infer.Session.session;
  };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session || !session.user) {
    throw new UnauthorizedException();
  }

  c.set('user', session.user);
  c.set('session', session.session);
  await next();
});
