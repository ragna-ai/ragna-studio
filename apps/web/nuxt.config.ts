import tailwindcss from '@tailwindcss/vite';
import { createResolver } from 'nuxt/kit';

const { resolve } = createResolver(import.meta.url);

const isDev = process.env.NODE_ENV === 'development';

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
    ['@pinia/nuxt', { autoImports: ['defineStore', 'acceptHMRUpdate'] }],
    '@nuxtjs/i18n',
    'nuxt-security',
  ],
  // CONFIG
  runtimeConfig: {
    public: {
      apiBaseUrl: 'http://localhost:3010', // default value for dev
    },
  },
  // SECURITY
  // apps/web has no server/ routes of its own (all data goes to apps/api
  // cross-origin), so the request-time middlewares below are no-ops here.
  // HSTS/X-Content-Type-Options/X-Frame-Options/X-XSS-Protection stay owned by
  // Traefik's shared default-security-headers (same as ragna-api), only CSP
  // needs to live here since its nonce has to be generated per-request.
  security: {
    enabled: !isDev,
    headers: {
      strictTransportSecurity: false,
      xContentTypeOptions: false,
      xFrameOptions: false,
      xXSSProtection: false,
      // static.ragna.io doesn't send Cross-Origin-Resource-Policy, COEP would
      // block image loads from it
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'connect-src': ["'self'", 'https://api.ragna.io', 'wss://api.ragna.io'],
        'img-src': ["'self'", 'data:', 'https://static.ragna.io'],
        // fonts are self-hosted via @nuxt/fonts, no external font host needed
        'font-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
      },
    },
    rateLimiter: false,
    requestSizeLimiter: false,
    xssValidator: false,
    corsHandler: false,
    allowedMethodsRestricter: false,
    csrf: false,
    sri: false,
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
      // Attachment file-type icons are resolved from a filename at runtime
      // (`getFileTypeIconName`), so the static `scan` can't discover them —
      // list them explicitly to get bundled.
      icons: [
        'vscode-icons:file-type-pdf2',
        'vscode-icons:file-type-word',
        'vscode-icons:file-type-powerpoint',
        'vscode-icons:file-type-excel',
        'vscode-icons:file-type-text',
        'vscode-icons:file-type-markdown',
        'vscode-icons:default-file',
      ],
    },
    customCollections: [
      {
        prefix: 'rg-icon',
        dir: resolve('./app/assets/rg-icons'),
      },
    ],
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
    optimizeDeps: {
      exclude: ['@tanstack/vue-query-devtools'],
    },
  },
  // DEV SERVER
  devServer: { port: 3000 },
});
