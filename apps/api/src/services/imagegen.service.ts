import type { GenerateImagesInput } from '@repo/ai';
import { createGenImages, imageGenProviders } from '@repo/ai';
import type { GenImage } from '@repo/database';
import {
  deleteGenImageByIdAndWorkspaceId,
  getAiModelById,
  getGenImageByIdAndWorkspaceId,
  getGenImageCountByWorkspaceId,
  getGenImagesByWorkspaceId,
} from '@repo/database';
import type { AiModel, GenImageReferenceOrigin } from '@repo/database/schema';
import { logger } from '@repo/logger';
import {
  buildImageUrls,
  deleteObjects,
  getImgGenBucketNameForUser,
  getImgRefBucketNameForUser,
  uploadObjectBuffer,
} from '@repo/storage';
import { tryCatch } from '@repo/utils';
import { randomUUID } from 'node:crypto';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export type GenImageReferenceInput =
  | { origin: 'genImage'; genImageId: string }
  | { origin: 'upload'; storageKey: string };

// The HTTP body swaps generateImagesSchema's provider + model pair for a
// single aiModelId, and its resolved-storage-key referenceImages for the
// origin/id union above (validation/gen-image.schema.ts). Both get resolved
// back into GenerateImagesInput's shape before calling createGenImages.
export type GenerateImagesForWorkspaceInput = Omit<
  GenerateImagesInput,
  'provider' | 'model' | 'referenceImages'
> & {
  aiModelId: string;
  referenceImages?: GenImageReferenceInput[];
};

export interface GenImageResponse {
  id: string;
  prompt: string;
  createdAt: Date;
  aspectRatio: string | null;
  resolution: string | null;
  seed: number | null;
  negativePrompt: string | null;
  provider: string;
  model: string;
  referenceImages: { origin: GenImageReferenceOrigin; imgUrl: string }[];
  rawUrl: string;
  imgUrl: string;
}

// Reference thumbnails resolve through buildImageUrls the same way the
// generated image itself does: it works for any key regardless of prefix,
// so 'upload' and 'genImage' references (different owners, same bucket)
// need no special-casing here.
function toReferenceImageResponse(
  reference: GenImage['referenceImages'][number],
  userId: string,
): { origin: GenImageReferenceOrigin; imgUrl: string } {
  return {
    origin: reference.origin,
    imgUrl: buildImageUrls({ userId, key: reference.storageKey }).imgUrl,
  };
}

// Mirrors createGenImages' own toGenImageDto (packages/ai/src/services/
// imagen.service.ts): the list endpoint reads raw GenImage rows straight
// from the DB, while the generate endpoint gets already-shaped DTOs back
// from createGenImages, so both need to end up at the same response shape.
function toGenImageResponse(record: GenImage): GenImageResponse {
  return {
    id: record.id,
    prompt: record.prompt,
    createdAt: record.createdAt,
    aspectRatio: record.aspectRatio,
    resolution: record.resolution,
    seed: record.seed,
    negativePrompt: record.negativePrompt,
    provider: record.provider,
    model: record.model,
    referenceImages: record.referenceImages.map((reference) =>
      toReferenceImageResponse(reference, record.userId),
    ),
    ...buildImageUrls({ userId: record.userId, key: record.storageKey }),
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
 * Deletes the row, then best-effort deletes its own output object from R2.
 * Reference images used as this row's generation input are left alone:
 * an 'upload' reference may be shared by sibling rows from the same batch
 * request, and a 'genImage' reference belongs to another row entirely.
 */
export async function deleteGenImage({
  workspaceId,
  genImageId,
}: {
  workspaceId: string;
  genImageId: string;
}): Promise<void> {
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

  const { bucketName } = getImgGenBucketNameForUser(deleted.userId);
  const { error: storageError, data } = await tryCatch(() =>
    deleteObjects(bucketName, [deleted.storageKey]),
  );

  if (storageError !== null) {
    logger.error('Failed to delete generated image object from R2', {
      error: storageError,
      key: deleted.storageKey,
    });
    return;
  }

  if (data && data.errors.length > 0) {
    logger.error('Failed to delete generated image object from R2', { keys: data.errors });
  }
}

// Not exported from @repo/ai (it's a private guard for imagen.service.ts's
// own provider param), so a request-time equivalent lives here: an
// ai_models row is free-text on provider/model, but createGenImages only
// accepts the three providers it knows how to call.
function isImageGenProvider(provider: string): provider is GenerateImagesInput['provider'] {
  return (imageGenProviders as readonly string[]).includes(provider);
}

/**
 * Narrows an ai_models row's free-text provider down to the literal union
 * createGenImages expects, or 500s. A right-modality image row with a
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

/**
 * Resolves one reference entry into the storage key createGenImages
 * (@repo/ai) expects. An 'upload' entry already owns its storage key (the
 * reference-upload endpoint below wrote it); a 'genImage' entry is a
 * workspace-scoped lookup so a caller can't condition on another
 * workspace's image (docs/imagegen/prd.md decision 4).
 */
async function resolveReferenceImage({
  reference,
  workspaceId,
}: {
  reference: GenImageReferenceInput;
  workspaceId: string;
}): Promise<{ origin: 'upload' | 'genImage'; storageKey: string }> {
  if (reference.origin === 'upload') {
    return { origin: 'upload', storageKey: reference.storageKey };
  }

  const { error, data: genImage } = await tryCatch(() =>
    getGenImageByIdAndWorkspaceId({ id: reference.genImageId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to load reference image', error);
    throw new InternalServerErrorException('Failed to load reference image');
  }

  if (!genImage) {
    throw new NotFoundException('Reference image not found in this workspace');
  }

  return { origin: 'genImage', storageKey: genImage.storageKey };
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
}): Promise<{ origin: 'upload' | 'genImage'; storageKey: string }[] | undefined> {
  if (!referenceImages || referenceImages.length === 0) {
    return undefined;
  }

  return Promise.all(
    referenceImages.map((reference) => resolveReferenceImage({ reference, workspaceId })),
  );
}

/**
 * [POST] /workspace/:workspaceId/gen-image
 * Generates image(s) from a prompt and persists them in the workspace.
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
  const { aiModelId, referenceImages, ...rest } = input;

  const aiModel = await loadImageAiModel(aiModelId);

  assertCapabilitiesSupportRequest({
    aiModel,
    seed: rest.seed,
    negativePrompt: rest.negativePrompt,
    referenceImages,
  });

  const resolvedReferenceImages = await resolveReferenceImages({ referenceImages, workspaceId });
  const provider = assertImageGenProvider(aiModel.provider);

  const { error, data: generated } = await tryCatch(() =>
    createGenImages({
      ...rest,
      provider,
      model: aiModel.model,
      referenceImages: resolvedReferenceImages,
      userId,
      workspaceId,
    }),
  );

  if (error !== null || !generated) {
    logger.error('Image generation failed', error);
    throw new InternalServerErrorException('Image generation failed');
  }

  return { genImages: generated.images };
}

// Same 10 MB cap as gen-video's frame upload (videogen.service.ts), PNG/
// JPEG/WEBP for the same reason: reference images may come from more
// varied sources than a generated-image download.
const REFERENCE_EXTENSION_BY_MIME_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;
type AllowedReferenceMimeType = keyof typeof REFERENCE_EXTENSION_BY_MIME_TYPE;
const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024;

function isAllowedReferenceMimeType(mimeType: string): mimeType is AllowedReferenceMimeType {
  return mimeType in REFERENCE_EXTENSION_BY_MIME_TYPE;
}

/**
 * [POST] /workspace/:workspaceId/gen-image/reference-upload
 * Uploads a reference image ahead of a generate request, mirroring
 * uploadGenVideoFrame (videogen.service.ts): validate, buffer, upload to R2
 * under the user's reference-image prefix, hand back the storage key for
 * the generate call above to reference.
 */
export async function uploadGenImageReference({
  userId,
  file,
}: {
  userId: string;
  file: File;
}): Promise<{ storageKey: string }> {
  if (!isAllowedReferenceMimeType(file.type)) {
    throw new BadRequestException('Unsupported image type. Use PNG, JPEG, or WEBP.');
  }

  if (file.size > MAX_REFERENCE_FILE_BYTES) {
    throw new BadRequestException('Image must be 10 MB or smaller');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { bucketName, prefix } = getImgRefBucketNameForUser(userId);
  const key = `${prefix}/${randomUUID()}.${REFERENCE_EXTENSION_BY_MIME_TYPE[file.type]}`;

  const { error } = await tryCatch(() =>
    uploadObjectBuffer({ bucketName, key, buffer, contentType: file.type }),
  );

  if (error !== null) {
    logger.error('Failed to upload reference image', error);
    throw new InternalServerErrorException('Failed to upload reference image');
  }

  return { storageKey: key };
}
