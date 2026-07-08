export const useApi = () => {
  const config = useRuntimeConfig();
  return $fetch.create({
    baseURL: config.public.apiBaseUrl || '',
    credentials: 'include',
  });
};
