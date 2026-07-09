export const useApi = () =>
  $fetch.create({
    baseURL: useRuntimeConfig().public.apiBaseUrl,
    credentials: 'include',
  });
