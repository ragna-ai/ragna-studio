const CSP_DIRECTIVES = ['connect-src', 'img-src', 'media-src'] as const;
type CspDirective = (typeof CSP_DIRECTIVES)[number];

function toOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Adds the deployment-specific API and media origins to the CSP at startup,
 * so one frontend image works on any domain.
 */
export default defineNitroPlugin(async (nitroApp) => {
  const { public: publicConfig } = useRuntimeConfig();
  const apiOrigin = toOrigin(publicConfig.apiBaseUrl);
  const mediaOrigin = toOrigin(publicConfig.mediaUrl);

  const extraSources: Record<CspDirective, string[]> = {
    'connect-src': apiOrigin
      ? [apiOrigin, toWebSocketUrl(apiOrigin).origin]
      : [],
    'img-src': mediaOrigin ? [mediaOrigin] : [],
    'media-src': mediaOrigin ? [mediaOrigin] : [],
  };

  nitroApp.hooks.hook('nuxt-security:routeRules', (routeRules) => {
    const headers = routeRules['/**']?.headers;
    if (!headers) return;
    const csp = headers.contentSecurityPolicy;
    if (!csp) return;

    for (const directive of CSP_DIRECTIVES) {
      const current = csp[directive];
      if (typeof current === 'string' || current === false) continue;
      const missing = extraSources[directive].filter(
        (source) => !current?.includes(source),
      );
      csp[directive] = [...(current ?? []), ...missing];
    }
  });

  // 00-routeRules fires ready once at its own init; re-fire so our listener runs even if we load later
  await nitroApp.hooks.callHook('nuxt-security:ready');
});
