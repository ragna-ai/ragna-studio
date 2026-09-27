// Nuxt swallows non-fatal component errors on the client in production builds.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('vue:error', (error, _instance, info) => {
    console.error(`[vue:error] ${info}`, error);
  });
});
