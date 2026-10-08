// packages/testing/src/ai-model/ai-model-fixtures.ts
import type { AiModelCapabilities } from '@repo/database/schema';
import { createAiModel } from '@repo/database';
import { assertConnectedToTestDatabase } from '../db/db-guard';

export interface SeedImageAiModelParams {
  provider?: 'bfl' | 'google-vertex' | 'openai';
  model?: string;
  displayName?: string;
  capabilities?: AiModelCapabilities;
}

export interface SeedImageAiModelResult {
  aiModelId: string;
  provider: string;
  model: string;
}

// Defaults every capability on, so a test only has to turn one off to
// exercise imagegen's capability gating (apps/api/src/services/
// imagegen.service.ts's assertCapabilitiesSupportRequest, specs/imagegen/
// prd.md decision 1).
const defaultCapabilities: AiModelCapabilities = {
  canGenerateImage: true,
  supportsSeed: true,
  supportsNegativePrompt: true,
  supportsReferenceImages: true,
  maxReferenceImages: 4,
};

/**
 * Seeds a minimal `ai_models` row with `modality: 'image'`, the row
 * `generateImagesForWorkspace` (apps/api/src/services/imagegen.service.ts)
 * looks up by `aiModelId` before calling `requestGenImages` (@repo/ai). No
 * pricing: imagegen isn't credit-gated yet, unlike the token-priced models
 * `seedTokenPricedAiModel` (credit-fixtures.ts) seeds for the credit system.
 */
export async function seedImageAiModel(
  params: SeedImageAiModelParams = {},
): Promise<SeedImageAiModelResult> {
  await assertConnectedToTestDatabase();

  const provider = params.provider ?? 'bfl';
  const model = params.model ?? `test-image-model-${crypto.randomUUID()}`;

  const aiModel = await createAiModel({
    provider,
    model,
    modality: 'image',
    family: 'diffusion',
    size: 'medium',
    displayName: params.displayName ?? 'Test Image Model',
    description: 'Seeded by packages/testing for imagegen tests.',
    pricing: null,
    capabilities: params.capabilities ?? defaultCapabilities,
    meta: {},
  });

  return { aiModelId: aiModel.id, provider, model };
}
