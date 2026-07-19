import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { extractErrorMessage } from '~/lib/api-error';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

interface GenImageListParams {
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}

export const genImageKeys = {
  all: (workspaceId: WorkspaceId) => ['gen-images', workspaceId] as const,
  list: (workspaceId: WorkspaceId, params: GenImageListParams) =>
    ['gen-images', workspaceId, 'list', params] as const,
  create: () => ['gen-images', 'create'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export const imageAspectRatios = ['1:1', '4:3', '16:9'] as const;
export type ImageAspectRatio = (typeof imageAspectRatios)[number];

export const imageResolutions = ['1K', '2K'] as const;
export type ImageResolution = (typeof imageResolutions)[number];

export interface GeneratedImage {
  id: string;
  prompt: string;
  rawUrl: string;
  imgUrl: string;
  createdAt: string;
}

export interface GenImagesResponse {
  genImages: GeneratedImage[];
  meta: { totalCount: number };
}

export interface GenerateImagesResponse {
  genImages: GeneratedImage[];
}

export interface GenerateImagesBody {
  prompt: string;
  provider: string;
  model: string;
  resolution?: ImageResolution;
  aspectRatio?: ImageAspectRatio;
  n?: number;
  seed?: number;
  negativePrompt?: string;
}

export function useGetGenImages(
  params: GenImageListParams = {},
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<GenImagesResponse>({
    queryKey: genImageKeys.list(workspaceId, params),
    queryFn: ({ signal }) =>
      $api<GenImagesResponse>(`/workspace/${toValue(workspaceId)}/gen-image`, {
        method: 'GET',
        query: params,
        signal,
      }),
    enabled: () => !!toValue(workspaceId),
    ...options,
  });
}

export function useGenerateImages() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<GenerateImagesResponse, unknown, GenerateImagesBody>({
    mutationKey: genImageKeys.create(),
    mutationFn: (body) =>
      $api<GenerateImagesResponse>(
        `/workspace/${toValue(workspaceId)}/gen-image`,
        { method: 'POST', body },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: genImageKeys.all(workspaceId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to generate images'));
    },
  });
}

/** Total number of images currently being generated across all in-flight requests. */
export function usePendingGenImageCount() {
  const pendingCounts = useMutationState({
    filters: { mutationKey: genImageKeys.create(), status: 'pending' },
    select: (mutation) =>
      (mutation.state.variables as GenerateImagesBody | undefined)?.n ?? 1,
  });
  return computed(() =>
    pendingCounts.value.reduce((total, count) => total + count, 0),
  );
}
