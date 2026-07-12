import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createId } from '../utils/create-id';
import { timestamps } from './common.schema';

// AI MODEL
// export const aiModelType = pgEnum('ai_model_type', ['llm', 'image', 'video', 'audio']);

export interface AiModelCapabilities {
  canGenerateText?: boolean;
  canGenerateImage?: boolean;
  canGenerateVideo?: boolean;
  canGenerateAudio?: boolean;
}

export interface AiModelMeta {
  [key: string]: any; // Allow any additional metadata fields
}

export const aiModelModalities = ['text', 'image', 'video', 'audio'] as const;
export type AiModelModality = (typeof aiModelModalities)[number];

export const aiModelFamilies = [
  'llm',
  'multimodal',
  'vision',
  'audio',
  'video',
  'diffusion',
] as const;
export type AiModelFamily = (typeof aiModelFamilies)[number];

export const aiModelSizes = ['small', 'medium', 'large', 'xlarge'] as const;
export type AiModelSize = (typeof aiModelSizes)[number];

export const aiModel = sqliteTable('ai_models', {
  id: text('id').primaryKey().$defaultFn(createId),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  modality: text('modality', { enum: aiModelModalities }).notNull(),
  family: text('family', { enum: aiModelFamilies }).notNull(),
  size: text('size', { enum: aiModelSizes }).notNull(),
  displayName: text('display_name').notNull(),
  description: text('description').notNull(),
  capabilities: text('capabilities', { mode: 'json' })
    .$type<AiModelCapabilities>()
    .default(sql`'{}'`),
  meta: text('meta', { mode: 'json' })
    .$type<AiModelMeta>()
    .default(sql`'{}'`),
  ...timestamps,
});

export type AiModel = typeof aiModel.$inferSelect;
export type NewAiModel = typeof aiModel.$inferInsert;
