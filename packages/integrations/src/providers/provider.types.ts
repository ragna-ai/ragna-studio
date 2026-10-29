export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  /** Empty when the provider doesn't report the granted scopes. */
  scopes: string[];
}

export interface ExternalAccountProfile {
  id: string;
  email: string | null;
  name: string | null;
}

export interface AuthorizeParams {
  state: string;
  codeChallenge: string;
  scopes: string[];
}

export interface ExchangeParams {
  code: string;
  state: string;
  codeVerifier: string;
}

export interface OAuthProvider {
  buildAuthorizeUrl(params: AuthorizeParams): URL;
  exchangeCode(params: ExchangeParams): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** No-op where the provider has no revoke endpoint. */
  revoke(token: string): Promise<void>;
  getAccountProfile(accessToken: string): Promise<ExternalAccountProfile>;
  /** False when the operator has not configured the provider's OAuth client. */
  isConfigured(): boolean;
}
