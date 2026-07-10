import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
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
    public: {
      apiBaseUrl: 'http://localhost:3010', // default value for dev
    },
  },
  // CSS
  css: ['~/assets/css/main.css'],
  shadcn: {
    prefix: '',
    componentDir: '~/components/ui',
  },
  // COMPONENTS
  // ai-elements are imported explicitly via their barrel files, not auto-imported
  components: {
    dirs: [
      {
        path: '~/components',
        ignore: ['ai-elements/**'],
      },
    ],
  },
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
  // META
  app: {
    head: {
      titleTemplate: '%s | RAGNA Studio',
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.png' }],
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
      ],
    },
  },
  // VITE
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        '@lucide/vue',
        'class-variance-authority',
        'clsx',
        'reka-ui',
        'tailwind-merge',
        'vue-sonner',
      ],
    },
  },
  // DEV SERVER
  devServer: { port: 3000 },
});
