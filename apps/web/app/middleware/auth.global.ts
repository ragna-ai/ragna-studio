export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/auth')) {
    return;
  }

  const authClient = useAuth();
  const { data: session } = await authClient.getSession();
  if (!session) {
    return navigateTo('/auth/login');
  }
});
