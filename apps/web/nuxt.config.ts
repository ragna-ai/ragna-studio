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
    ['@pinia/nuxt', { autoImports: ['defineStore', 'acceptHMRUpdate'] }],
    '@nuxtjs/i18n',
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
  // ICONS
  icon: {
    provider: 'none',
    clientBundle: {
      scan: true,
    },
  },
  // IMAGE
  image: {
    // provider: 'cloudflare',
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
  // i18n
  i18n: {
    locales: [
      {
        code: 'en',
        language: 'en-UK',
        name: 'English',
        file: 'en-UK.json',
      },
      {
        code: 'de',
        language: 'de-DE',
        name: 'Deutsch',
        file: 'de-DE.json',
      },
    ],
    defaultLocale: 'de',
    strategy: 'no_prefix',
    baseUrl: 'https://ragna.io',
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
    // Pre-transform pages/components at dev startup so navigation doesn't
    // stall on first-visit compilation.
    server: {
      warmup: {
        clientFiles: [
          './app/pages/**/*.vue',
          './app/features/**/*.vue',
          './app/components/**/*.vue',
          './app/layouts/**/*.vue',
        ],
      },
    },
  },
  // DEV SERVER
  devServer: { port: 3000 },
});
