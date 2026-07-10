import { reset } from 'drizzle-seed';
import { db } from '../db';
import * as schema from '../schema';

async function seedAiModels() {
  await db.insert(schema.aiModel).values([
    {
      provider: 'openai',
      model: 'gpt-5-nano',
      displayName: 'GPT-5 Nano',
      description: 'A fast and efficient AI model by OpenAI.',
    },
    {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      displayName: 'Claude Haiku 4.5',
      description: 'An advanced AI model by Anthropic focused on creativity.',
    },
  ]);
}

async function seedDefaultAssistant() {
  // find the claude-haiku-4-5 model
  const defaultModel = await db.query.aiModel.findFirst({
    where: { model: 'claude-haiku-4-5', provider: 'anthropic' },
  });

  if (!defaultModel) {
    throw new Error('Default AI model not found. Please seed AI models first.');
  }
  await db.insert(schema.defaultAssistant).values({
    aiModelId: defaultModel.id,
    name: 'RAGNA Agent',
    description: 'Your personal AI agent.',
    systemPrompt: 'You are a helpful assistant.',
    tools: '[]', // No tools by default
    settings: '{}', // Default settings
  });
}

async function main() {
  await reset(db, schema);
  await seedAiModels();
  await seedDefaultAssistant();
}

main().catch((error) => {
  console.error('Error seeding database:', error);
  process.exit(1);
});
