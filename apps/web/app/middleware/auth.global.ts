export default defineNuxtRouteMiddleware(async (to) => {
  const isAuthRoute = to.path === '/auth' || to.path.startsWith('/auth/');
  if (isAuthRoute) {
    return;
  }

  const session = await refreshAuthSession();

  if (!session) {
    return navigateTo('/auth/login');
  }
});
