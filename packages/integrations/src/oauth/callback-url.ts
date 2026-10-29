import { config } from '@repo/config';

export const OAUTH_CALLBACK_PATH = '/integration/oauth/callback';

export function getOAuthCallbackUrl(): string {
  return `${config.apiBaseUrl.replace(/\/$/, '')}${OAUTH_CALLBACK_PATH}`;
}
