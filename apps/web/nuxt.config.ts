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
      mediaUrl: '',
    },
  },
  // SECURITY
  // apps/web has no server routes of its own (only the CSP plugin in server/plugins;
  // all data goes to apps/api cross-origin), so the request-time middlewares below are no-ops here.
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
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        // API and media origins are appended at runtime by server/plugins/csp-origins.ts
        'connect-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'"],
        // vue-i18n falls back to its JIT (`new Function`) message compiler for
        // any t(`...${dynamicKey}`) call, since the key can't be statically
        // precompiled at build time. That pattern is used throughout the app
        // (workflow/task/dataset status labels, social providers, etc.).
        'script-src': [
          "'self'",
          'https:',
          "'unsafe-inline'",
          "'unsafe-eval'",
          "'strict-dynamic'",
          "'nonce-{{nonce}}'",
        ],
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
        ignore: ['ai-elements/**', 'editor/*.ts'],
      },
    ],
  },
  // ICONS
  icon: {
    provider: 'none',
    // Icon CSS sits below Tailwind utilities, so `size-*` classes win over its 1em default.
    cssLayer: 'base',
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
        // Provider logos live in a .ts lookup (`integration-meta.ts`), which `scan` skips.
        'logos:google-icon',
        'logos:microsoft-icon',
        'logos:linkedin-icon',
        // Nav icons live in .ts lookups (`useNavItems`, `useSettingsNavItems`).
        'hugeicons:mail-01',
        'hugeicons:home-01',
        'hugeicons:check-list',
        'hugeicons:file-02',
        'hugeicons:grid-table',
        'hugeicons:bubble-chat',
        'hugeicons:robotic',
        'hugeicons:flow-connection',
        'hugeicons:image-01',
        'hugeicons:video-replay',
        'hugeicons:share-08',
        'hugeicons:building-03',
        'hugeicons:user-group',
        'hugeicons:grid-view',
        'hugeicons:wallet-01',
        'hugeicons:connect',
        'hugeicons:plug-01',
        'hugeicons:tag-01',
        'hugeicons:user',
        'hugeicons:translate',
        'hugeicons:coins-01',
        // Notification kind marks live in `types/kind.ts`.
        'hugeicons:unplug',
        'hugeicons:notification-01',
        // Agent tool icons live in `agent-tool-icons.ts`.
        'hugeicons:ai-brain-01',
        'hugeicons:notebook-02',
        'hugeicons:globe-02',
        'hugeicons:web-design-01',
        'hugeicons:linkedin-01',
        'hugeicons:google-drive',
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
    format: ['avif', 'webp'],
    quality: 80,
  },
  // FONTS
  fonts: {
    families: [
      {
        name: 'Inter',
        provider: 'google',
      },
      {
        name: 'Geist Mono',
        provider: 'google',
        weights: [400, 500],
      },
      {
        name: 'Bricolage Grotesque',
        provider: 'google',
        weights: [600],
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
