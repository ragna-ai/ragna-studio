import { jsonb, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';

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

export const pgModalityEnum = pgEnum('modality', aiModelModalities);
export const pgFamilyEnum = pgEnum('family', aiModelFamilies);
export const pgSizeEnum = pgEnum('size', aiModelSizes);

export const aiModel = pgTable('ai_models', {
  id: primaryIdColumn,
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  modality: pgModalityEnum().notNull(),
  family: pgFamilyEnum().notNull(),
  size: pgSizeEnum().notNull(),
  displayName: text('display_name').notNull(),
  description: text('description').notNull(),
  capabilities: jsonb('capabilities').default('{}').$type<AiModelCapabilities>(),
  meta: jsonb('meta').default('{}').$type<AiModelMeta>(),
  ...timestamps,
});

export type AiModel = typeof aiModel.$inferSelect;
export type NewAiModel = typeof aiModel.$inferInsert;
