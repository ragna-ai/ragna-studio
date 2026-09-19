// Global auth middleware
export default defineNuxtRouteMiddleware(async (to) => {
  const toPath = to.path.toLowerCase();
  // if is auth route, don't check auth session
  if (toPath === '/auth' || toPath.startsWith('/auth/')) {
    return;
  }

  const result = await refreshAuthSession();

  // three guard clause, no nesting: confirmed-session → proceed, confirmed-no-session → redirect, request-failed → fall back to cached state.

  // Authoritative: server confirmed a session.
  if (result.ok && result.session) {
    return;
  }

  // Authoritative: server confirmed no session.
  if (result.ok && !result.session) {
    return navigateTo('/auth/login');
  }

  // result.ok === false: the request failed (network/infra error), which is
  // not authoritative. Fail open only if we have a previously confirmed
  // session to fall back on; otherwise there is no known-good session to
  // keep the user logged in as, so deny access.
  if (!useAuthSession().value) {
    return navigateTo('/auth/login');
  }
});
