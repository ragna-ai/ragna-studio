export default defineNuxtPlugin({
  setup() {
    const api = $fetch.create({
      baseURL: useRuntimeConfig().public.apiBaseUrl,
      credentials: 'include',
    });

    return {
      provide: {
        api,
      },
    };
  },
});
