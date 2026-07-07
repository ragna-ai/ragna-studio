export function useAuth() {
  return useNuxtApp().$authClient;
}
