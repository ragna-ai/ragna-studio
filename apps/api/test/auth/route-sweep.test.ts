import { describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import { app } from '../../src/app';
import { allowedOrigins } from '../../src/utils/allowed-origins';

// Sweeps every registered route and asserts it rejects an unauthenticated
// request, so a controller that forgets `.use(authMiddleware)` fails a test
// instead of shipping. Complements
// session.test.ts and test/workspace/workspace-authorization.test.ts, which
// test the middlewares themselves against one vehicle route each; this test
// checks that every controller actually wires them in.
//
// Routes are read from `app.routes` (Hono's own introspection, also used by
// the commented-out `showRoutes()` in app.ts) rather than hand-maintained,
// so a new controller is covered automatically. `:param` segments are
// replaced with a placeholder: authMiddleware runs before any route's param
// validation or DB lookup (verified by reading every controller's
// `.use()` chain), so the placeholder never needs to be a real id.
//
// Two routes are intentionally excluded: `GET /health` (liveness probe) and
// `/auth/*` (better-auth's own handler, which mints sessions and so can't
// require one).
//
// Note for anyone tempted to sabotage-test this file by deleting a single
// controller's `.use(authMiddleware)`: every workspace-scoped controller is
// mounted under `/workspace/*` (app.ts), and `workspaceController` itself
// applies `authMiddleware` at that same `/workspace/*` wildcard. Hono
// composes every middleware whose pattern matches a request path, in
// registration order, regardless of which controller "owns" the route, so
// that top-level guard still catches most workspace routes even if a
// leaf controller's own copy is removed. `notificationController`
// (`/notification`, no `/workspace` overlap) is a route to strip
// `authMiddleware` from if you want to see this file actually fail.

interface RouteUnderTest {
  method: string;
  path: string;
}

function collectRoutesRequiringAuth(): RouteUnderTest[] {
  const seen = new Set<string>();
  const routes: RouteUnderTest[] = [];

  for (const { method, path } of app.routes) {
    if (method === 'ALL' || path === '/health' || path.startsWith('/auth/')) {
      continue;
    }

    const key = `${method} ${path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    routes.push({ method, path });
  }

  return routes;
}

function toRequestPath(path: string): string {
  return path.replace(/:[^/]+/g, 'placeholder');
}

describe('every route requires authentication unless explicitly public', () => {
  const routes = collectRoutesRequiringAuth();

  // Sanity check on the sweep itself: if this list is empty or tiny, the
  // filters above are wrong and the rest of this file passes vacuously.
  test('found a non-trivial number of routes to sweep', () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  test.each(routes)(
    '$method $path rejects a request with no session cookie',
    async ({ method, path }) => {
      const response = await app.request(toRequestPath(path), {
        method,
        // GET /ws sits behind requireAllowedOrigin before authMiddleware
        // (cross-site WebSocket hijacking guard); a real Origin header
        // isolates the auth check for that route without affecting others.
        headers: { origin: allowedOrigins[0] ?? '' },
      });

      expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
    },
  );
});
