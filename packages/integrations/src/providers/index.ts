import type { ProviderId } from '../catalog';
import { googleProvider } from './google/google.provider';
import { linkedinProvider } from './linkedin/linkedin.provider';
import { microsoftProvider } from './microsoft/microsoft.provider';
import type { ProviderAdapter } from './provider.types';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  google: googleProvider,
  microsoft: microsoftProvider,
  linkedin: linkedinProvider,
};

export function getProviderAdapter(provider: ProviderId): ProviderAdapter {
  return ADAPTERS[provider];
}

export type * from './provider.types';
