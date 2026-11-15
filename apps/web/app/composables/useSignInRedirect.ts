interface SignInRedirect {
  /** Where to land after a successful sign-in: home, or the pending MCP authorize request. */
  resolveSignInTarget: () => string;
  /** Where a failed sign-in returns to, keeping a pending authorize request. */
  resolveSignInErrorTarget: () => string;
}

/** Post-sign-in targets shared by every sign-in method (OAuth, passkey). */
export function useSignInRedirect(): SignInRedirect {
  const route = useRoute();
  const {
    public: { apiBaseUrl },
  } = useRuntimeConfig();

  // A pending MCP authorize request: resume it instead of the normal home page.
  const isOAuthAuthorizeResume = computed(
    () =>
      typeof route.query.client_id === 'string' &&
      typeof route.query.sig === 'string',
  );

  // Absolute URLs back to this web app. A relative path would resolve against
  // the API origin (baseURL) and land the user on the API, not the app.
  function resolveSignInTarget(): string {
    return isOAuthAuthorizeResume.value
      ? `${apiBaseUrl}/auth/oauth2/authorize${window.location.search}`
      : `${window.location.origin}/`;
  }

  function resolveSignInErrorTarget(): string {
    return `${window.location.origin}/auth/login${window.location.search}`;
  }

  return { resolveSignInTarget, resolveSignInErrorTarget };
}
