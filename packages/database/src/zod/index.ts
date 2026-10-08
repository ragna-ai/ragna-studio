import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/zod';
import z from 'zod';
import { agent, agentReasoningEffortValues, agentToolValues, aiModel, chat, chatMessage } from '../schema';
import { user } from '../schema/user.schema';

// USER
export const userSelectSchema = createSelectSchema(user);
export type UserSelectSchema = z.infer<typeof userSelectSchema>;
export const userCreateSchema = createInsertSchema(user);
export type UserCreateSchema = z.infer<typeof userCreateSchema>;
export type ICreateUser = Omit<UserCreateSchema, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export const userUpdateSchema = createUpdateSchema(user, {
  name: (s) => s.min(4).max(32),
});
export type UserUpdateSchema = z.infer<typeof userUpdateSchema>;
export type IUpdateUser = Partial<UserUpdateSchema>;

// AGENT
// jsonb columns lose their `.$type<T>()` generic in drizzle-orm/zod (it only
// sees "json" and falls back to a generic Json schema), so `tools` and
// `settings` need explicit refinements to come out as `AgentTool[]` /
// `AgentSettings` instead of `Json`.
export const agentToolsSchema = z.array(z.enum(agentToolValues)).optional();
export const agentSettingsSchema = z
  .object({
    temperature: z.number().nullish(),
    maxOutputTokens: z.number().nullish(),
    reasoning: z.enum(agentReasoningEffortValues).nullish(),
  })
  .optional();
const agentRefine = { tools: agentToolsSchema, settings: agentSettingsSchema };

export const agentSelectSchema = createSelectSchema(agent, agentRefine);
export type AgentSelectSchema = z.infer<typeof agentSelectSchema>;
export const agentCreateSchema = createInsertSchema(agent, agentRefine);
export type AgentCreateSchema = z.infer<typeof agentCreateSchema>;
export type ICreateAgent = Omit<AgentCreateSchema, 'id' | 'createdAt' | 'updatedAt'>;
export const agentUpdateSchema = createUpdateSchema(agent, agentRefine);
export type AgentUpdateSchema = z.infer<typeof agentUpdateSchema>;
export type IUpdateAgent = Partial<AgentUpdateSchema>;

// AI MODEL
// Same jsonb-typing gap as AGENT above: `capabilities`/`meta` need explicit
// refinements to come out as `AiModelCapabilities` / `AiModelMeta`.
const aiModelCapabilitiesSchema = z.object({
  canGenerateText: z.boolean().optional(),
  canGenerateImage: z.boolean().optional(),
  canGenerateVideo: z.boolean().optional(),
  canGenerateAudio: z.boolean().optional(),
  // Image-generation inputs. Absent means unsupported (fail closed).
  supportsNegativePrompt: z.boolean().optional(),
  supportsSeed: z.boolean().optional(),
  supportsReferenceImages: z.boolean().optional(),
  maxReferenceImages: z.number().optional(),
});
const aiModelMetaSchema = z.record(z.string(), z.any());
// Pricing: discriminated by `kind`, same
// shape as AiModelPricing in aimodel.schema.ts. V1 only implements `token`;
// `image`/`video` are declared so v2 is additive.
const aiModelPricingSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('token'),
      nanoUsdPerInputToken: z.number(),
      nanoUsdPerOutputToken: z.number(),
      nanoUsdPerCacheReadToken: z.number().optional(),
      nanoUsdPerCacheWriteToken: z.number().optional(),
      markupBps: z.number().optional(),
    }),
    z.object({ kind: z.literal('image'), nanoUsdPerImage: z.number() }),
    z.object({ kind: z.literal('video'), nanoUsdPerSecond: z.number() }),
  ])
  .nullable();
const aiModelRefine = {
  capabilities: aiModelCapabilitiesSchema,
  meta: aiModelMetaSchema,
  pricing: aiModelPricingSchema,
};

export const aiModelSelectSchema = createSelectSchema(aiModel, aiModelRefine);
export type AiModelSelectSchema = z.infer<typeof aiModelSelectSchema>;
export const aiModelCreateSchema = createInsertSchema(aiModel, aiModelRefine);
export type AiModelCreateSchema = z.infer<typeof aiModelCreateSchema>;
export type ICreateAiModel = Omit<AiModelCreateSchema, 'id' | 'createdAt' | 'updatedAt'>;
export const aiModelUpdateSchema = createUpdateSchema(aiModel, aiModelRefine);
export type AiModelUpdateSchema = z.infer<typeof aiModelUpdateSchema>;
export type IUpdateAiModel = Partial<AiModelUpdateSchema>;

// CHAT
export const chatSelectSchema = createSelectSchema(chat);
export type ChatSelectSchema = z.infer<typeof chatSelectSchema>;
export const chatCreateSchema = createInsertSchema(chat);
export type ChatCreateSchema = z.infer<typeof chatCreateSchema>;
export type ICreateChat = Omit<ChatCreateSchema, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

// CHAT MESSAGE
// Same jsonb-typing gap as AGENT above: `metadata` needs an explicit
// refinement to come out as `Record<string, any>` instead of `Json`.
const chatMessageRefine = { metadata: z.record(z.string(), z.any()).nullish() };

export const chatMessageSelectSchema = createSelectSchema(chatMessage, chatMessageRefine);
export type ChatMessageSelectSchema = z.infer<typeof chatMessageSelectSchema>;
export const chatMessageCreateSchema = createInsertSchema(chatMessage, chatMessageRefine);
export type ChatMessageCreateSchema = z.infer<typeof chatMessageCreateSchema>;
export type ICreateChatMessage = Omit<
  ChatMessageCreateSchema,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;
// Upserts carry the client-generated UIMessage id so retries replace instead of duplicate.
export type IUpsertChatMessage = ICreateChatMessage & { id: string };
