export const useApiFetch = createUseFetch({
  baseURL: useRuntimeConfig().public.apiBaseUrl || '',
  credentials: 'include',
});
