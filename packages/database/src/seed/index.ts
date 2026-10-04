import { db } from '../db';
import * as schema from '../schema';

// Safe to run on every deploy: it only seeds an empty table. Admins swap the `model` of a family slot to newer
// releases in the DB, so re-inserting by (provider, model) would re-add
// outdated models next to the swapped ones.
async function seedAiModels() {
  const existing = await db.query.aiModel.findFirst();
  if (existing) {
    return;
  }

  await db.insert(schema.aiModel).values([
    {
      provider: 'openai',
      model: 'gpt-5.6-luna',
      modality: 'text',
      family: 'llm',
      size: 'small',
      displayName: 'GPT Small (Luna)',
      description: 'A fast and efficient intelligence layer for simple tasks.',
    },
    {
      provider: 'openai',
      model: 'gpt-5.6-terra',
      modality: 'text',
      family: 'llm',
      size: 'medium',
      displayName: 'GPT Medium (Terra)',
      description: 'A fast and efficient intelligence layer for simple tasks.',
    },
    {
      provider: 'openai',
      model: 'gpt-5.6-sol',
      modality: 'text',
      family: 'llm',
      size: 'large',
      displayName: 'GPT Large (Sol)',
      description: 'A fast and efficient intelligence layer for simple tasks.',
    },
    {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      modality: 'text',
      family: 'llm',
      size: 'small',
      displayName: 'Claude Small (Haiku)',
      description: 'A fast and efficient intelligence layer for simple tasks.',
    },
    {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      modality: 'text',
      family: 'llm',
      size: 'medium',
      displayName: 'Claude Medium (Sonnet)',
      description: 'A fast and efficient intelligence layer for simple tasks.',
    },
    {
      provider: 'anthropic',
      model: 'claude-opus-5',
      modality: 'text',
      family: 'llm',
      size: 'large',
      displayName: 'Claude Large (Opus)',
      description: 'A fast and efficient intelligence layer for simple tasks.',
    },
    {
      provider: 'bfl',
      model: 'flux-2-pro',
      modality: 'image',
      family: 'diffusion',
      size: 'medium',
      displayName: 'FLUX 2 Pro',
      description: 'High-quality image generation by Black Forest Labs.',
    },
    {
      provider: 'google-vertex',
      model: 'gemini-3-pro-image-preview',
      modality: 'image',
      family: 'multimodal',
      size: 'medium',
      displayName: 'Gemini 3 Pro Image',
      description: 'Photorealistic image generation by Google.',
    },
    {
      provider: 'openai',
      model: 'gpt-image-1',
      modality: 'image',
      family: 'diffusion',
      size: 'medium',
      displayName: 'GPT Image 1',
      description: 'Versatile image generation by OpenAI.',
    },
    // Listed first: getDefaultAiModelByModality() has no isDefault flag, it
    // just returns the first row matching the modality, so insertion order
    // decides the default (same convention the image rows above rely on).
    {
      provider: 'google-vertex',
      model: 'veo-3.1-fast-generate-preview',
      modality: 'video',
      family: 'video',
      size: 'small',
      displayName: 'Veo 3.1 Fast',
      description: 'Fast video generation by Google Veo.',
    },
    {
      provider: 'google-vertex',
      model: 'veo-3.1-generate-preview',
      modality: 'video',
      family: 'video',
      size: 'medium',
      displayName: 'Veo 3.1',
      description: 'High-quality video generation by Google Veo.',
    },
    // Listed after the Veo rows so it is never the modality default
    // (docs/videogen/prd-v2.md goals). Adds draft mode, see
    // videoGenCapabilities in @repo/ai's videogen.service.ts.
    {
      provider: 'bfl',
      model: 'flux-3-video',
      modality: 'video',
      family: 'video',
      size: 'medium',
      displayName: 'FLUX 3 Video',
      description: 'Video generation with draft/enhance by Black Forest Labs.',
    },
  ]);
}

// Bootstraps the one default agent template by name, since it has no
// natural business key of its own to upsert on like seedAiModels does.
async function seedDefaultAgent() {
  const existing = await db.query.agentTemplate.findFirst({
    where: { name: 'RAGNA Agent' },
  });
  if (existing) {
    return;
  }

  const defaultModel = await db.query.aiModel.findFirst({
    where: { provider: 'anthropic', size: 'small' },
  });

  if (!defaultModel) {
    throw new Error('Default AI model not found. Please seed AI models first.');
  }
  await db.insert(schema.agentTemplate).values({
    aiModelId: defaultModel.id,
    name: 'RAGNA Agent',
    description: 'Your personal AI agent.',
    systemPrompt: 'You are a helpful assistant.',
    // tools: [], // No tools by default
    // settings: {}, // Default settings
  });
}

async function main() {
  await seedAiModels();
  await seedDefaultAgent();
}

main()
  .catch((error) => {
    console.error('Error seeding database:', error);
    process.exitCode = 1;
  })
  // The pool's default idle timeout is 10s, so without this the process
  // just hangs open waiting it out instead of exiting once seeding is done.
  .finally(() => db.$client.end());
