import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

export const genImageKeys = {
  all: ['gen-images'] as const,
  list: () => ['gen-images', 'list'] as const,
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
  images: GeneratedImage[];
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

export function useGetGenImages(options: QueryOpts = {}) {
  const api = useApi();
  return useQuery<GenImagesResponse>({
    queryKey: genImageKeys.list(),
    queryFn: ({ signal }) => api('/image/generate', { method: 'GET', signal }),
    ...options,
  });
}

export function useGenerateImages() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<GenImagesResponse, unknown, GenerateImagesBody>({
    mutationKey: genImageKeys.create(),
    mutationFn: (body) => api('/image/generate', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: genImageKeys.all });
    },
    onError: () => {
      toast.error('Failed to generate images');
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
