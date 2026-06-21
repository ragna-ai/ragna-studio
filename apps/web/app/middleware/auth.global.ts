import { authClient } from '@repo/auth/client';

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/auth')) {
    return;
  }
  const { data: session } = await authClient.useSession(useFetch);
  if (!session.value) {
    return navigateTo('/auth/login');
  }
});
