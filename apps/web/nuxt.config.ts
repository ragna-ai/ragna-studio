import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  telemetry: false,
  // SSR
  ssr: false,
  // MODULES
  modules: [
    'shadcn-nuxt',
    '@vueuse/nuxt',
    '@nuxt/icon',
    '@nuxt/fonts',
    '@nuxt/image',
  ],
  // CSS
  css: ['~/assets/css/main.css'],
  // VITE
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['@lucide/vue', 'clsx', 'tailwind-merge', 'vue-sonner'],
    },
  },
});
