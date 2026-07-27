export default defineNuxtRouteMiddleware(async (to) => {
  const toPath = to.path.toLowerCase();
  // is auth route, don't check auth session
  if (toPath === '/auth' || toPath.startsWith('/auth/')) {
    return;
  }

  const result = await refreshAuthSession();

  // Fail open: an infra error is not authoritative, keep the last-known-good
  // session state and let navigation proceed.
  if (result.ok && !result.session) {
    return navigateTo('/auth/login');
  }
});
