import { jsonb, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';

export interface AiModelCapabilities {
  canGenerateText?: boolean;
  canGenerateImage?: boolean;
  canGenerateVideo?: boolean;
  canGenerateAudio?: boolean;
  // Image-generation inputs. Absent means unsupported (fail closed).
  supportsNegativePrompt?: boolean;
  supportsSeed?: boolean;
  supportsReferenceImages?: boolean;
  maxReferenceImages?: number;
}

export interface AiModelMeta {
  [key: string]: any; // Allow any additional metadata fields
}

// Discriminated by `kind` so v2 (image/video) is additive, no migration
// needed (specs/credits/prd.md, "Pricing"). V1 only implements `token`; a
// model with no pricing, or a `kind` the charger doesn't implement yet, is
// not chargeable and the credit gate refuses to start a run on it, same as
// the `capabilities` fail-closed convention above.
export type AiModelPricing =
  | {
      kind: 'token';
      nanoUsdPerInputToken: number;
      nanoUsdPerOutputToken: number;
      // Real platform cost of a cache hit / write. Used only for margin
      // analytics, never for what the user is charged. Absent means caching
      // is not modeled for this model.
      nanoUsdPerCacheReadToken?: number;
      nanoUsdPerCacheWriteToken?: number;
      // Overrides config.creditMarkupBps for this model.
      markupBps?: number;
    }
  | { kind: 'image'; nanoUsdPerImage: number } // v2
  | { kind: 'video'; nanoUsdPerSecond: number }; // v2

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

export const aiModel = pgTable(
  'ai_models',
  {
    id: primaryIdColumn,
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    modality: pgModalityEnum().notNull(),
    family: pgFamilyEnum().notNull(),
    size: pgSizeEnum().notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull(),
    capabilities: jsonb('capabilities').default({}).notNull().$type<AiModelCapabilities>(),
    meta: jsonb('meta').default({}).notNull().$type<AiModelMeta>(),
    // Set by hand, same as capabilities: no seeding here (specs/credits/prd.md,
    // "Pricing"). Null means "not chargeable".
    pricing: jsonb('pricing').$type<AiModelPricing>(),
    ...timestamps,
  },
  (table) => [uniqueIndex('ai_model_provider_model_idx').on(table.provider, table.model)],
);

export type AiModel = typeof aiModel.$inferSelect;
export type NewAiModel = typeof aiModel.$inferInsert;
