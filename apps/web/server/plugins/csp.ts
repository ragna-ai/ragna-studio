// Environment-specific CSP origins, set at runtime so one image serves prod and local.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('nuxt-security:routeRules', (routeRules) => {
    const runtimeConfig = useRuntimeConfig();

    const apiUrl = new URL(runtimeConfig.public.apiBaseUrl);
    const apiWsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiWsOrigin = `${apiWsProtocol}//${apiUrl.host}`;

    const mediaOrigins = runtimeConfig.cspMediaOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    routeRules['/**'] = defuReplaceArray(
      {
        headers: {
          contentSecurityPolicy: {
            'connect-src': ["'self'", apiUrl.origin, apiWsOrigin],
            'img-src': ["'self'", 'data:', ...mediaOrigins],
            'media-src': ["'self'", ...mediaOrigins],
          },
        },
      },
      routeRules['/**'],
    );
  });
});
