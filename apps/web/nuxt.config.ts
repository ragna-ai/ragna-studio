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
    '@pinia/nuxt',
    'pinia-plugin-unstorage/nuxt',
  ],
  // CONFIG
  runtimeConfig: {
    public: {},
  },
  // CSS
  css: ['~/assets/css/main.css'],
  // IMAGE
  image: {
    provider: 'cloudflare',
    format: ['avif', 'webp'],
    quality: 80,
    cloudflare: {
      baseURL: 'https://static.ragna.io',
    },
  },
  // FONTS
  fonts: {
    families: [
      {
        name: 'Inter',
        provider: 'google',
      },
    ],
  },
  // VITE
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['@lucide/vue', 'clsx', 'tailwind-merge', 'vue-sonner'],
    },
  },
});
