import type { GenerateImagesInput, GenImageDto } from '@repo/ai';
import { imageGenProviders, requestGenImages } from '@repo/ai';
import type { GenImage, GenImageReferenceWithMedia, GenImageWithMedia } from '@repo/database';
import {
  deleteGenImageByIdAndWorkspaceId,
  getAiModelById,
  getGenImageByIdAndWorkspaceId,
  getGenImageCountByWorkspaceId,
  getGenImageReferenceMediaIds,
  getGenImagesByWorkspaceId,
} from '@repo/database';
import type { AiModel, GenImageReferenceOrigin } from '@repo/database/schema';
import { logger } from '@repo/logger';
import { deleteMediaIfUnreferenced } from '@repo/media';
import { toPublicMediaUrl } from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';
import type { UploadedImageInputResponse } from './media.service';
import { getOwnedImageMedia, storeWorkspaceImageInput } from './media.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export type GenImageReferenceInput =
  | { origin: 'genImage'; genImageId: string }
  | { origin: 'upload'; mediaId: string };

// The HTTP body swaps generateImagesSchema's provider + model pair for a
// single aiModelId, and its resolved-storage-key referenceImages for the
// origin/id union above (validation/gen-image.schema.ts). Both get resolved
// back into GenerateImagesInput's shape before calling requestGenImages.
export type GenerateImagesForWorkspaceInput = Omit<
  GenerateImagesInput,
  'provider' | 'model' | 'referenceImages'
> & {
  aiModelId: string;
  referenceImages?: GenImageReferenceInput[];
};

// status/error and the optional urls mirror @repo/ai's GenImageDto
// (docs/imagegen/worker-execution-prd.md decision 7): imgUrl is
// undefined until the worker fills the row in.
export interface GenImageResponse {
  id: string;
  status: GenImage['status'];
  error: string | null;
  prompt: string;
  createdAt: Date;
  aspectRatio: string | null;
  resolution: string | null;
  seed: number | null;
  negativePrompt: string | null;
  visibleWatermark: boolean;
  provider: string;
  model: string;
  referenceImages: { origin: GenImageReferenceOrigin; imgUrl: string }[];
  imgUrl?: string;
}

// Reference thumbnails resolve through toPublicMediaUrl the same way the
// generated image itself does: it works for any key regardless of prefix,
// so 'upload' and 'genImage' references (different owners, same bucket)
// need no special-casing here. The storage key comes off the reference's
// joined media row now (docs/media-library/migration-prd.md), not a jsonb
// column.
function toReferenceImageResponse(
  reference: GenImageReferenceWithMedia,
): { origin: GenImageReferenceOrigin; imgUrl: string } {
  return {
    origin: reference.origin,
    imgUrl: toPublicMediaUrl(reference.media.storageKey),
  };
}

// Mirrors @repo/ai's own toGenImageDto (imagen.service.ts): the list
// endpoint reads raw GenImage rows straight from the DB, while the generate
// endpoint gets already-shaped DTOs back from requestGenImages, so both need
// to end up at the same response shape (toGenImageResponseFromDto below).
// record.media is null for a pending/processing/failed row
// (docs/imagegen/worker-execution-prd.md decision 1), so the urls stay
// undefined until the worker fills the row in.
function toGenImageResponse(record: GenImageWithMedia): GenImageResponse {
  return {
    id: record.id,
    status: record.status,
    error: record.error,
    prompt: record.prompt,
    createdAt: record.createdAt,
    aspectRatio: record.aspectRatio,
    resolution: record.resolution,
    seed: record.seed,
    negativePrompt: record.negativePrompt,
    visibleWatermark: record.visibleWatermark,
    provider: record.provider,
    model: record.model,
    referenceImages: record.references.map((reference) =>
      toReferenceImageResponse(reference),
    ),
    imgUrl: record.media ? toPublicMediaUrl(record.media.storageKey) : undefined,
  };
}

// requestGenImages (@repo/ai) already returns GenImageDto in the exact
// shape GenImageResponse needs (decision 4: no reload, every field the
// response needs is known at request time), so this is a straight
// pass-through kept as an explicit named mapper rather than relying on
// structural assignability, so a future @repo/ai DTO change fails here
// instead of silently changing the public API response.
function toGenImageResponseFromDto(dto: GenImageDto): GenImageResponse {
  return {
    id: dto.id,
    status: dto.status,
    error: dto.error,
    prompt: dto.prompt,
    createdAt: dto.createdAt,
    aspectRatio: dto.aspectRatio,
    resolution: dto.resolution,
    seed: dto.seed,
    negativePrompt: dto.negativePrompt,
    visibleWatermark: dto.visibleWatermark,
    provider: dto.provider,
    model: dto.model,
    referenceImages: dto.referenceImages,
    imgUrl: dto.imgUrl,
  };
}

/**
 * [GET] /workspace/:workspaceId/gen-image
 * Lists a workspace's generated images, newest first by default.
 */
export async function listGenImages({
  workspaceId,
  page,
  limit,
  sort,
}: {
  workspaceId: string;
  page?: number | null;
  limit?: number | null;
  sort?: 'asc' | 'desc';
}): Promise<{ genImages: GenImageResponse[]; meta: { totalCount: number } }> {
  const resolvedPage = page && page > 0 ? page : DEFAULT_PAGE;
  const resolvedLimit = limit && limit > 0 ? limit : DEFAULT_LIMIT;
  const offset = (resolvedPage - 1) * resolvedLimit;

  const { error, data: records } = await tryCatch(() =>
    getGenImagesByWorkspaceId({ workspaceId, limit: resolvedLimit, offset, sort }),
  );

  if (error !== null || !records) {
    logger.error('Failed to list generated images', error);
    throw new InternalServerErrorException('Failed to list generated images');
  }

  // Same filter as the list query above, so meta.totalCount matches it exactly.
  const { error: countError, data: totalCount } = await tryCatch(() =>
    getGenImageCountByWorkspaceId({ workspaceId }),
  );

  if (countError !== null || totalCount === null) {
    logger.error('Failed to count generated images', countError);
    throw new InternalServerErrorException('Failed to count generated images');
  }

  return { genImages: records.map(toGenImageResponse), meta: { totalCount } };
}

/**
 * [DELETE] /workspace/:workspaceId/gen-image/:genImageId
 * Deletes the row (its gen_image_reference links cascade with it), then
 * refcount-deletes the output media and every referenced media
 * (docs/media-library/migration-prd.md decision 5): a reference may still
 * be shared by a sibling row from the same batch request, another gen_images
 * row entirely, or a social post, so only a zero reference count actually
 * removes the R2 object.
 */
export async function deleteGenImage({
  workspaceId,
  genImageId,
}: {
  workspaceId: string;
  genImageId: string;
}): Promise<void> {
  // Read before deleting: the delete below cascades gen_image_reference rows
  // away, so their media ids must be collected first (gen-image.repo.ts).
  const { error: refError, data: referenceMediaIds } = await tryCatch(() =>
    getGenImageReferenceMediaIds({ genImageId }),
  );

  if (refError !== null || referenceMediaIds === null) {
    logger.error('Failed to load generated image references', refError);
    throw new InternalServerErrorException('Failed to delete generated image');
  }

  const { error, data: deleted } = await tryCatch(() =>
    deleteGenImageByIdAndWorkspaceId({ id: genImageId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to delete generated image', error);
    throw new InternalServerErrorException('Failed to delete generated image');
  }

  if (!deleted) {
    throw new NotFoundException('Generated image not found');
  }

  // deleted.mediaId is null for a pending/processing/failed row
  // (docs/imagegen/worker-execution-prd.md decision 1): nothing to
  // refcount-delete for those, same filter as videogen's deleteGenVideo.
  const mediaIds = [deleted.mediaId, ...referenceMediaIds].filter(
    (mediaId): mediaId is string => mediaId !== null,
  );

  await Promise.all(mediaIds.map((mediaId) => deleteMediaIfUnreferenced({ mediaId })));
}

// Not exported from @repo/ai (it's a private guard for imagen.service.ts's
// own provider param), so a request-time equivalent lives here: an
// ai_models row is free-text on provider/model, but requestGenImages only
// accepts the three providers it knows how to call.
function isImageGenProvider(provider: string): provider is GenerateImagesInput['provider'] {
  return (imageGenProviders as readonly string[]).includes(provider);
}

/**
 * Narrows an ai_models row's free-text provider down to the literal union
 * requestGenImages expects, or 500s. A right-modality image row with a
 * provider outside imageGenProviders is a seed/data problem, not something
 * the caller did wrong, so it isn't a 400.
 */
function assertImageGenProvider(provider: string): GenerateImagesInput['provider'] {
  if (isImageGenProvider(provider)) {
    return provider;
  }

  logger.error('Image model has an unsupported provider', { provider });
  throw new InternalServerErrorException('Image model has an unsupported provider');
}

/**
 * Loads the ai_models row a generate request names and guards it down to
 * "usable as an image model": missing rows and wrong-modality rows (e.g. a
 * text or video model id) both 404, since neither is a valid image model
 * from the caller's point of view.
 */
async function loadImageAiModel(aiModelId: string): Promise<AiModel> {
  const { error, data: aiModel } = await tryCatch(() => getAiModelById({ aiModelId }));

  if (error !== null) {
    logger.error('Failed to load AI model', error);
    throw new InternalServerErrorException('Failed to load AI model');
  }

  if (!aiModel || aiModel.modality !== 'image') {
    throw new NotFoundException('Image model not found');
  }

  return aiModel;
}

/**
 * Server-side half of the capability gating the form applies client-side
 * (docs/imagegen/prd.md decision 1): fail closed, so a flag that is absent,
 * null or false means the field is rejected rather than silently dropped.
 * Naming both the field and the model in the message keeps a hand-crafted
 * request as debuggable as a UI-driven one.
 */
function assertCapabilitiesSupportRequest({
  aiModel,
  seed,
  negativePrompt,
  referenceImages,
}: {
  aiModel: AiModel;
  seed?: number;
  negativePrompt?: string;
  referenceImages?: GenImageReferenceInput[];
}): void {
  const { capabilities, model } = aiModel;

  if (negativePrompt !== undefined && !capabilities.supportsNegativePrompt) {
    throw new BadRequestException(`negativePrompt is not supported by model "${model}"`);
  }

  if (seed !== undefined && !capabilities.supportsSeed) {
    throw new BadRequestException(`seed is not supported by model "${model}"`);
  }

  if (!referenceImages || referenceImages.length === 0) {
    return;
  }

  if (!capabilities.supportsReferenceImages) {
    throw new BadRequestException(`referenceImages is not supported by model "${model}"`);
  }

  const maxReferenceImages = capabilities.maxReferenceImages ?? 0;

  if (referenceImages.length > maxReferenceImages) {
    throw new BadRequestException(
      `referenceImages exceeds the limit of ${maxReferenceImages} for model "${model}"`,
    );
  }
}

interface ResolvedReferenceImage {
  origin: GenImageReferenceOrigin;
  mediaId: string;
  storageKey: string;
}

/**
 * Resolves one reference entry into the mediaId/storageKey pair
 * requestGenImages (@repo/ai) expects: mediaId to link once the output rows
 * exist, storageKey to download the bytes to condition the generation on. A
 * 'genImage' entry is a workspace-scoped lookup so a caller can't condition
 * on another workspace's image (docs/imagegen/prd.md decision 4).
 */
async function resolveReferenceImage({
  reference,
  workspaceId,
}: {
  reference: GenImageReferenceInput;
  workspaceId: string;
}): Promise<ResolvedReferenceImage> {
  if (reference.origin === 'upload') {
    const mediaRow = await getOwnedImageMedia({ workspaceId, mediaId: reference.mediaId });
    return { origin: 'upload', mediaId: mediaRow.id, storageKey: mediaRow.storageKey };
  }

  const { error, data: genImage } = await tryCatch(() =>
    getGenImageByIdAndWorkspaceId({ id: reference.genImageId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to load reference image', error);
    throw new InternalServerErrorException('Failed to load reference image');
  }

  // mediaId/media are null for a pending/processing/failed row
  // (docs/imagegen/worker-execution-prd.md decision 1): a generation that
  // hasn't produced an object yet has nothing to condition on, so it's
  // rejected the same as a genImageId that doesn't exist at all.
  if (!genImage || !genImage.mediaId || !genImage.media) {
    throw new NotFoundException('Reference image not found in this workspace');
  }

  return { origin: 'genImage', mediaId: genImage.mediaId, storageKey: genImage.media.storageKey };
}

/**
 * Resolves every reference entry independently, so 'upload' and 'genImage'
 * origins can be mixed in one request. Promise.all keeps each result at the
 * same index as its input regardless of resolution order, which matters
 * here: reference order is meaningful to the image providers.
 */
async function resolveReferenceImages({
  referenceImages,
  workspaceId,
}: {
  referenceImages?: GenImageReferenceInput[];
  workspaceId: string;
}): Promise<ResolvedReferenceImage[] | undefined> {
  if (!referenceImages || referenceImages.length === 0) {
    return undefined;
  }

  return Promise.all(
    referenceImages.map((reference) => resolveReferenceImage({ reference, workspaceId })),
  );
}

// Mirrors videogen.service.ts's isCapabilityViolationError: any @repo/ai
// error message starting with "Provider " is a capability violation, not an
// infra failure, and maps to 400 like assertCapabilitiesSupportRequest's own
// checks above. imagen.service.ts throws no such error today (its
// capability gating happens entirely in assertCapabilitiesSupportRequest,
// before any row is inserted), but keeping the same convention here means a
// future provider-side check added there surfaces correctly without another
// API-layer change (docs/imagegen/worker-execution-prd.md decision 4).
function isCapabilityViolationError(error: Error): boolean {
  return error.message.startsWith('Provider ');
}

/**
 * [POST] /workspace/:workspaceId/gen-image
 * Requests image generation from a prompt: inserts pending rows and
 * enqueues the render job (requestGenImages in @repo/ai), then responds
 * immediately. The worker (gen-images.processor.ts) does the slow part; no
 * await, no timeout mapping (docs/imagegen/worker-execution-prd.md decision
 * 4). Mirrors generateVideoForWorkspace's shape.
 */
export async function generateImagesForWorkspace({
  userId,
  workspaceId,
  input,
}: {
  userId: string;
  workspaceId: string;
  input: GenerateImagesForWorkspaceInput;
}): Promise<{ genImages: GenImageResponse[] }> {
  const {
    aiModelId,
    referenceImages,
    prompt,
    resolution,
    aspectRatio,
    n,
    seed,
    negativePrompt,
    visibleWatermark,
  } = input;

  const aiModel = await loadImageAiModel(aiModelId);

  assertCapabilitiesSupportRequest({
    aiModel,
    seed,
    negativePrompt,
    referenceImages,
  });

  const resolvedReferenceImages = await resolveReferenceImages({ referenceImages, workspaceId });
  const provider = assertImageGenProvider(aiModel.provider);

  const { error, data: created } = await tryCatch(() =>
    requestGenImages({
      prompt,
      resolution,
      aspectRatio,
      n,
      seed,
      negativePrompt,
      visibleWatermark,
      provider,
      model: aiModel.model,
      referenceImages: resolvedReferenceImages,
      userId,
      workspaceId,
    }),
  );

  if (error !== null || !created) {
    if (error !== null && isCapabilityViolationError(error)) {
      throw new BadRequestException(error.message);
    }

    logger.error('Failed to request image generation', error);
    throw new InternalServerErrorException('Failed to request image generation');
  }

  return { genImages: created.map(toGenImageResponseFromDto) };
}

/**
 * [POST] /workspace/:workspaceId/gen-image/reference-upload
 * Stores a reference image as a workspace media row ahead of a generate
 * request, which then references it by mediaId.
 */
export async function uploadGenImageReference({
  workspaceId,
  file,
}: {
  workspaceId: string;
  file: File;
}): Promise<UploadedImageInputResponse> {
  return storeWorkspaceImageInput({ workspaceId, file });
}
