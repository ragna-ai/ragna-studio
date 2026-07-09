export default defineNuxtRouteMiddleware(async (to) => {
  const isAuthRoute = to.path === '/auth' || to.path.startsWith('/auth/');
  if (isAuthRoute) {
    return;
  }

  const result = await refreshAuthSession();

  // Fail open: an infra error is not authoritative, keep the last-known-good
  // session state and let navigation proceed.
  if (result.ok && !result.session) {
    return navigateTo('/auth/login');
  }
});
