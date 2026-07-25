import { useQuery, type UseQueryOptions } from '@tanstack/vue-query';

type QueryOpts = Partial<UseQueryOptions<any>>;

/**
 * Image-generation input flags read from `ai_models.capabilities`
 * (docs/imagegen/prd.md). Fail closed: an absent or falsy flag means the
 * input is unavailable, not that it defaults to on. The maintainer seeds
 * these per model by hand, so an unseeded row is `{}` and every advanced
 * option renders disabled.
 */
export interface AiModelCapabilities {
  supportsNegativePrompt?: boolean;
  supportsSeed?: boolean;
  supportsReferenceImages?: boolean;
  maxReferenceImages?: number;
}

export interface AiModelListItem {
  id: string;
  provider: string;
  model: string;
  modality: string;
  displayName: string;
  capabilities: AiModelCapabilities;
}

export interface AiModelListResponse {
  models: AiModelListItem[];
  providers: Array<{ id: string; displayName: string }>;
}

export function useGetAllAiModels(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  return useQuery<AiModelListResponse>({
    queryKey: ['aimodels'],
    queryFn: ({ signal }) =>
      $api<AiModelListResponse>('/aimodel', {
        method: 'GET',
        signal,
      }),
    placeholderData: (prev) => prev, // keep previous results while refetching
    ...options,
  });
}
