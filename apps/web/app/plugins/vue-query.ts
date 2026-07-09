import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // SPA (ssr: false): no server prefetch, so tune purely for the client.
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });

  return { provide: { queryClient } };
});
