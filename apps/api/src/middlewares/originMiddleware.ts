import { createMiddleware } from 'hono/factory';
import { ForbiddenException } from '../exceptions';
import { allowedOrigins } from '../utils/allowed-origins';

// CORS does not apply to WebSocket handshakes: any site can open a socket
// to this API and the browser will still attach the session cookie
// (cross-site WebSocket hijacking). Browsers always send an Origin header
// on a WS handshake, so requiring it to match the web app's origin closes
// that hole the same way CORS does for fetch/XHR.
export const requireAllowedOrigin = createMiddleware(async (c, next) => {
  const origin = c.req.header('origin');

  if (!origin || !allowedOrigins.includes(origin)) {
    throw new ForbiddenException('Origin not allowed');
  }

  await next();
});
