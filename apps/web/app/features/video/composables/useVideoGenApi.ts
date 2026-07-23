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
  frameUpload: () => ['gen-videos', 'frame-upload'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export const videoGenAspectRatios = ['16:9', '9:16'] as const;
export type VideoGenAspectRatio = (typeof videoGenAspectRatios)[number];

export const videoGenResolutions = ['720p', '1080p'] as const;
export type VideoGenResolution = (typeof videoGenResolutions)[number];

export const videoGenDurations = [4, 6, 8] as const;
export type VideoGenDuration = (typeof videoGenDurations)[number];

// 1080p is only documented for 16:9 on Veo; 9:16 stays at 720p
// (docs/videogen/prd.md, videogen.service.ts's supportedResolutionsByAspectRatio).
const supportedResolutionsByAspectRatio: Record<
  VideoGenAspectRatio,
  readonly VideoGenResolution[]
> = {
  '16:9': ['720p', '1080p'],
  '9:16': ['720p'],
};

export function getSupportedResolutions(
  aspectRatio: VideoGenAspectRatio,
): readonly VideoGenResolution[] {
  return supportedResolutionsByAspectRatio[aspectRatio];
}

export type GenVideoStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type VideoFrameInput =
  | { origin: 'genImage'; genImageId: string }
  | { origin: 'upload'; storageKey: string };

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
  duration: VideoGenDuration;
  generateAudio: boolean;
  negativePrompt?: string;
  seed?: number;
  frame?: VideoFrameInput;
}

export interface FrameUploadResponse {
  storageKey: string;
}

// The grid polls while any row on the fetched page is still rendering: the
// temporary stand-in for WS push (docs/videogen/prd.md decision 8).
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
