import {
  useMutation,
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
  delete: () => ['gen-images', 'delete'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export const imageAspectRatios = ['1:1', '4:3', '16:9'] as const;
export type ImageAspectRatio = (typeof imageAspectRatios)[number];

export const imageResolutions = ['1K', '2K'] as const;
export type ImageResolution = (typeof imageResolutions)[number];

export type ImageReferenceInput =
  | { origin: 'genImage'; genImageId: string }
  | { origin: 'upload'; mediaId: string };

export interface GeneratedImageReference {
  origin: 'upload' | 'genImage';
  imgUrl: string;
}

// Mirrors @repo/database's GenImageStatus (genimage.schema.ts). Kept as a
// local copy so the web bundle never imports the server database package,
// the same reasoning as GenVideoStatus in useVideoGenApi.ts.
export type GenImageStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface GeneratedImage {
  id: string;
  status: GenImageStatus;
  error: string | null;
  prompt: string;
  // Undefined until the row completes:
  // a pending/processing/failed row has no object yet.
  imgUrl?: string;
  createdAt: string;
  // Nullable on the wire (the DB columns have no default), even though
  // createGenImageBatch always fills them in.
  aspectRatio: ImageAspectRatio | null;
  resolution: ImageResolution | null;
  seed: number | null;
  negativePrompt: string | null;
  model: string;
  provider: string;
  referenceImages: GeneratedImageReference[];
  visibleWatermark: boolean;
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
  visibleWatermark?: boolean;
}

export interface ReferenceUploadResponse {
  mediaId: string;
  imgUrl: string;
}

/**
 * The subset of a generated image's settings the preview dialog can hand
 * back to the form. Reference images are deliberately excluded: the response
 * only carries a display `imgUrl` for each one, not the `genImageId` /
 * `mediaId` a new request would need to resubmit it.
 */
export interface ReuseImageSettings {
  provider: string;
  model: string;
  aspectRatio: ImageAspectRatio | null;
  resolution: ImageResolution | null;
  seed: number | null;
  negativePrompt: string | null;
  visibleWatermark: boolean;
}

// The grid polls while any row on the fetched page is still generating: the
// temporary stand-in for WS push, mirrors useVideoGenApi.ts's own poll
// (shorter interval since a batch usually finishes in seconds, not minutes).
const IMAGE_GEN_POLL_INTERVAL_MS = 2000;

function hasInFlightRow(genImages: GeneratedImage[]): boolean {
  return genImages.some(
    (image) => image.status === 'pending' || image.status === 'processing',
  );
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
    refetchInterval: (query) => {
      const genImages = query.state.data?.genImages ?? [];
      return hasInFlightRow(genImages) ? IMAGE_GEN_POLL_INTERVAL_MS : false;
    },
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
    onSuccess: ({ genImages }) => {
      // Prepend the batch's pending rows straight into every cached list
      // page so they show up immediately, without waiting for a refetch
      // round trip. The conditional refetchInterval then takes over polling
      // them to completion (mirrors useVideoGenApi.ts's useGenerateVideo).
      queryClient.setQueriesData<GenImagesResponse>(
        { queryKey: genImageKeys.all(workspaceId) },
        (old) =>
          old
            ? {
                genImages: [...genImages, ...old.genImages],
                meta: { totalCount: old.meta.totalCount + genImages.length },
              }
            : old,
      );
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

export function useDeleteGenImage() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationKey: genImageKeys.delete(),
    mutationFn: (genImageId) =>
      $api<void>(`/workspace/${toValue(workspaceId)}/gen-image/${genImageId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: genImageKeys.all(workspaceId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to delete image'));
    },
  });
}
