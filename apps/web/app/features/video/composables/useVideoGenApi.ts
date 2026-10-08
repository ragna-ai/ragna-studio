import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { extractErrorMessage } from '~/lib/api-error';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

interface GenVideoListParams {
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}

export const videoGenKeys = {
  all: (workspaceId: WorkspaceId) => ['gen-videos', workspaceId] as const,
  list: (workspaceId: WorkspaceId, params: GenVideoListParams) =>
    ['gen-videos', workspaceId, 'list', params] as const,
  create: () => ['gen-videos', 'create'] as const,
  enhance: () => ['gen-videos', 'enhance'] as const,
  frameUpload: () => ['gen-videos', 'frame-upload'] as const,
  delete: () => ['gen-videos', 'delete'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

// Veo on Vertex and BFL flux-3-video. Kept in sync
// by hand with packages/ai/src/services/videogen.service.ts's
// videoGenProviders: the web can't import that module's runtime value
// directly, it would pull the server-only AI SDK into the browser bundle.
export const videoGenProviders = ['google-vertex', 'bfl'] as const;
export type VideoGenProvider = (typeof videoGenProviders)[number];

// Union of Veo's ratios and BFL's ratios; which ones a given provider
// actually accepts lives in videoGenCapabilities below.
export const videoGenAspectRatios = [
  '21:9',
  '2:1',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  'auto',
] as const;
export type VideoGenAspectRatio = (typeof videoGenAspectRatios)[number];

export const videoGenResolutions = ['720p', '1080p'] as const;
export type VideoGenResolution = (typeof videoGenResolutions)[number];

// Veo's duration picker stays a fixed 4/6/8s select (today's form); BFL
// instead drives a 5-20s slider off videoGenCapabilities.bfl.durationRange,
// specs/videogen/prd-v2.md "Web (apps/web)".
export const videoGenDurations = [4, 6, 8] as const;

export interface VideoGenCapability {
  aspectRatios: readonly VideoGenAspectRatio[];
  resolutionsByAspectRatio: Partial<Record<VideoGenAspectRatio, readonly VideoGenResolution[]>>;
  durationRange: { min: number; max: number };
  supportsSeed: boolean;
  supportsNegativePrompt: boolean;
  supportsDraft: boolean;
}

// Mirrors packages/ai/src/services/videogen.service.ts's videoGenCapabilities,
// the same way videoGenAspectRatios/
// videoGenResolutions above already mirror that package's v1 constants
// instead of importing its runtime module. Drives both the form's per-model
// UI and the reconciliation of persisted settings when the model's provider
// changes; the server enforces the same map, so this is presentation only.
export const videoGenCapabilities: Record<VideoGenProvider, VideoGenCapability> = {
  'google-vertex': {
    aspectRatios: ['16:9', '9:16'],
    resolutionsByAspectRatio: {
      '16:9': ['720p', '1080p'],
      '9:16': ['720p'],
    },
    durationRange: { min: 4, max: 8 },
    supportsSeed: true,
    supportsNegativePrompt: true,
    supportsDraft: false,
  },
  bfl: {
    aspectRatios: ['21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16', 'auto'],
    resolutionsByAspectRatio: {
      '21:9': ['720p', '1080p'],
      '2:1': ['720p', '1080p'],
      '16:9': ['720p', '1080p'],
      '4:3': ['720p', '1080p'],
      '1:1': ['720p', '1080p'],
      '3:4': ['720p', '1080p'],
      '9:16': ['720p', '1080p'],
      auto: ['720p', '1080p'],
    },
    durationRange: { min: 5, max: 20 },
    supportsSeed: false,
    supportsNegativePrompt: false,
    supportsDraft: true,
  },
};

const DEFAULT_CAPABILITY_PROVIDER: VideoGenProvider = 'google-vertex';

// Falls back to Vertex's capability for an unrecognised/undefined provider
// (e.g. the model list hasn't loaded yet), the same conservative default
// videogen.service.ts's own resolveCapability would reject outright but the
// form needs *something* to render before a model is selected.
export function getVideoGenCapability(provider: string | undefined): VideoGenCapability {
  if (provider === 'google-vertex' || provider === 'bfl') {
    return videoGenCapabilities[provider];
  }
  return videoGenCapabilities[DEFAULT_CAPABILITY_PROVIDER];
}

export function getSupportedResolutions(
  provider: string | undefined,
  aspectRatio: VideoGenAspectRatio,
): readonly VideoGenResolution[] {
  return getVideoGenCapability(provider).resolutionsByAspectRatio[aspectRatio] ?? [];
}

export type GenVideoStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type VideoFrameInput =
  | { origin: 'genImage'; genImageId: string }
  | { origin: 'upload'; mediaId: string };

export interface GeneratedVideo {
  id: string;
  prompt: string;
  status: GenVideoStatus;
  error: string | null;
  // Nullable on the wire (the DB columns have no default until a row is
  // created), even though createGenVideoRecord always fills them in.
  aspectRatio: VideoGenAspectRatio | null;
  resolution: VideoGenResolution | null;
  duration: number | null;
  generateAudio: boolean;
  model: string;
  createdAt: string;
  videoUrl?: string;
  // BFL draft/enhance: isDraft flags a
  // fast preview render; parentGenVideoId is set on the enhance row it
  // produced, pointing back at the draft it replays at full quality.
  isDraft: boolean;
  parentGenVideoId: string | null;
  // Applied to draft rows at generation time and copied from the parent
  // draft onto its enhance row server-side; the
  // form has nothing to send on the enhance mutation, this is display only.
  visibleWatermark: boolean;
}

export interface GenVideosResponse {
  genVideos: GeneratedVideo[];
  meta: { totalCount: number };
}

export interface GenerateVideoResponse {
  genVideo: GeneratedVideo;
}

export interface GenerateVideoBody {
  prompt: string;
  model?: string;
  provider?: string;
  aspectRatio: VideoGenAspectRatio;
  resolution: VideoGenResolution;
  duration: number;
  generateAudio: boolean;
  negativePrompt?: string;
  seed?: number;
  frame?: VideoFrameInput;
  draft?: boolean;
  visibleWatermark?: boolean;
}

export interface FrameUploadResponse {
  mediaId: string;
  imgUrl: string;
}

// The grid polls while any row on the fetched page is still rendering: the
// temporary stand-in for WS push.
const VIDEO_GEN_POLL_INTERVAL_MS = 5000;

function hasInFlightRow(genVideos: GeneratedVideo[]): boolean {
  return genVideos.some(
    (video) => video.status === 'pending' || video.status === 'processing',
  );
}

export function useGetGenVideos(
  params: GenVideoListParams = {},
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<GenVideosResponse>({
    queryKey: videoGenKeys.list(workspaceId, params),
    queryFn: ({ signal }) =>
      $api<GenVideosResponse>(`/workspace/${toValue(workspaceId)}/gen-video`, {
        method: 'GET',
        query: params,
        signal,
      }),
    enabled: () => !!toValue(workspaceId),
    refetchInterval: (query) => {
      const genVideos = query.state.data?.genVideos ?? [];
      return hasInFlightRow(genVideos) ? VIDEO_GEN_POLL_INTERVAL_MS : false;
    },
    ...options,
  });
}

export function useGenerateVideo() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<GenerateVideoResponse, unknown, GenerateVideoBody>({
    mutationKey: videoGenKeys.create(),
    mutationFn: (body) =>
      $api<GenerateVideoResponse>(
        `/workspace/${toValue(workspaceId)}/gen-video`,
        { method: 'POST', body },
      ),
    onSuccess: ({ genVideo }) => {
      // Prepend the pending row straight into every cached list page so it
      // shows up immediately, without waiting for a refetch round trip. The
      // conditional refetchInterval then takes over polling it to completion.
      queryClient.setQueriesData<GenVideosResponse>(
        { queryKey: videoGenKeys.all(workspaceId) },
        (old) =>
          old
            ? {
                genVideos: [genVideo, ...old.genVideos],
                meta: { totalCount: old.meta.totalCount + 1 },
              }
            : old,
      );
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to generate video'));
    },
  });
}

/**
 * Turns a completed BFL draft into a new pending row that re-renders it at
 * full quality. The one-enhance-
 * per-draft check is authoritative on the server (a 409 when a pending/
 * processing/completed enhance already exists for the draft); a failure
 * here always refetches the list too, since it means the grid's local
 * "already has an enhance" check (VideoGenGrid.vue) was stale.
 */
export function useEnhanceGenVideo() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<GenerateVideoResponse, unknown, string>({
    mutationKey: videoGenKeys.enhance(),
    mutationFn: (genVideoId) =>
      $api<GenerateVideoResponse>(
        `/workspace/${toValue(workspaceId)}/gen-video/${genVideoId}/enhance`,
        { method: 'POST' },
      ),
    onSuccess: ({ genVideo }) => {
      // Same immediate-prepend as useGenerateVideo above: the pending
      // enhance row appears in the grid right away, and the existing
      // conditional refetchInterval polls it to completion.
      queryClient.setQueriesData<GenVideosResponse>(
        { queryKey: videoGenKeys.all(workspaceId) },
        (old) =>
          old
            ? {
                genVideos: [genVideo, ...old.genVideos],
                meta: { totalCount: old.meta.totalCount + 1 },
              }
            : old,
      );
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to request enhance'));
      queryClient.invalidateQueries({ queryKey: videoGenKeys.all(workspaceId) });
    },
  });
}

export function useUploadVideoFrame() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useMutation<FrameUploadResponse, unknown, File>({
    mutationKey: videoGenKeys.frameUpload(),
    mutationFn: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return $api<FrameUploadResponse>(
        `/workspace/${toValue(workspaceId)}/gen-video/frame-upload`,
        { method: 'POST', body: formData },
      );
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to upload frame image'));
    },
  });
}

export function useDeleteGenVideo() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationKey: videoGenKeys.delete(),
    mutationFn: (genVideoId) =>
      $api<void>(`/workspace/${toValue(workspaceId)}/gen-video/${genVideoId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: videoGenKeys.all(workspaceId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to delete video'));
    },
  });
}
