import type { ProviderId } from '../catalog';
import { googleProvider } from './google/google.provider';
import { linkedinProvider } from './linkedin/linkedin.provider';
import { microsoftProvider } from './microsoft/microsoft.provider';
import type { OAuthProvider } from './provider.types';

const PROVIDERS: Record<ProviderId, OAuthProvider> = {
  google: googleProvider,
  microsoft: microsoftProvider,
  linkedin: linkedinProvider,
};

export function getOAuthProvider(provider: ProviderId): OAuthProvider {
  return PROVIDERS[provider];
}

export type * from './provider.types';
