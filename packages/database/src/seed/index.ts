import { reset } from 'drizzle-seed';
import { db } from '../db';
import * as schema from '../schema';

async function seedAiModels() {
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
      model: 'imagen-4.0-generate-001',
      modality: 'image',
      family: 'diffusion',
      size: 'medium',
      displayName: 'Imagen 4',
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
  ]);
}

async function seedDefaultAgent() {
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
  await reset(db, schema);
  await seedAiModels();
  await seedDefaultAgent();
}

main().catch((error) => {
  console.error('Error seeding database:', error);
  process.exit(1);
});
