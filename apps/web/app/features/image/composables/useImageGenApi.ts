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
  referenceUpload: () => ['gen-images', 'reference-upload'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export const imageAspectRatios = ['1:1', '4:3', '16:9'] as const;
export type ImageAspectRatio = (typeof imageAspectRatios)[number];

export const imageResolutions = ['1K', '2K'] as const;
export type ImageResolution = (typeof imageResolutions)[number];

export type ImageReferenceInput =
  | { origin: 'genImage'; genImageId: string }
  | { origin: 'upload'; storageKey: string };

export interface GeneratedImageReference {
  origin: 'upload' | 'genImage';
  imgUrl: string;
}

export interface GeneratedImage {
  id: string;
  prompt: string;
  rawUrl: string;
  imgUrl: string;
  createdAt: string;
  // Nullable on the wire (the DB columns have no default), even though
  // createGenImages always fills them in for a completed row.
  aspectRatio: ImageAspectRatio | null;
  resolution: ImageResolution | null;
  seed: number | null;
  negativePrompt: string | null;
  model: string;
  provider: string;
  referenceImages: GeneratedImageReference[];
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
  aiModelId: string;
  resolution?: ImageResolution;
  aspectRatio?: ImageAspectRatio;
  n?: number;
  seed?: number;
  negativePrompt?: string;
  referenceImages?: ImageReferenceInput[];
}

export interface ReferenceUploadResponse {
  storageKey: string;
}

/**
 * The subset of a generated image's settings the preview dialog can hand
 * back to the form. Reference images are deliberately excluded: the response
 * only carries a display `imgUrl` for each one, not the `genImageId` /
 * `storageKey` a new request would need to resubmit it.
 */
export interface ReuseImageSettings {
  provider: string;
  model: string;
  aspectRatio: ImageAspectRatio | null;
  resolution: ImageResolution | null;
  seed: number | null;
  negativePrompt: string | null;
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

export function useUploadImageReference() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useMutation<ReferenceUploadResponse, unknown, File>({
    mutationKey: genImageKeys.referenceUpload(),
    mutationFn: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return $api<ReferenceUploadResponse>(
        `/workspace/${toValue(workspaceId)}/gen-image/reference-upload`,
        { method: 'POST', body: formData },
      );
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error, 'Failed to upload reference image'),
      );
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
