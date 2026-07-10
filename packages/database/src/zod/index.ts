import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/zod';
import type z from 'zod';
import { aiModel, assistant, chat, chatMessage } from '../schema';
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

// ASSISTANT
export const assistantSelectSchema = createSelectSchema(assistant);
export type AssistantSelectSchema = z.infer<typeof assistantSelectSchema>;
export const assistantCreateSchema = createInsertSchema(assistant);
export type AssistantCreateSchema = z.infer<typeof assistantCreateSchema>;
export type ICreateAssistant = Omit<AssistantCreateSchema, 'id' | 'createdAt' | 'updatedAt'>;
export const assistantUpdateSchema = createUpdateSchema(assistant);
export type AssistantUpdateSchema = z.infer<typeof assistantUpdateSchema>;
export type IUpdateAssistant = Partial<AssistantUpdateSchema>;
// export const assistantToolsSchema = z.enum(assistantTools);

// AI MODEL
export const aiModelSelectSchema = createSelectSchema(aiModel);
export type AiModelSelectSchema = z.infer<typeof aiModelSelectSchema>;
export const aiModelCreateSchema = createInsertSchema(aiModel);
export type AiModelCreateSchema = z.infer<typeof aiModelCreateSchema>;
export type ICreateAiModel = Omit<AiModelCreateSchema, 'id' | 'createdAt' | 'updatedAt'>;
export const aiModelUpdateSchema = createUpdateSchema(aiModel);
export type AiModelUpdateSchema = z.infer<typeof aiModelUpdateSchema>;
export type IUpdateAiModel = Partial<AiModelUpdateSchema>;

// CHAT
export const chatSelectSchema = createSelectSchema(chat);
export type ChatSelectSchema = z.infer<typeof chatSelectSchema>;
export const chatCreateSchema = createInsertSchema(chat);
export type ChatCreateSchema = z.infer<typeof chatCreateSchema>;
export type ICreateChat = Omit<ChatCreateSchema, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

// CHAT MESSAGE
export const chatMessageSelectSchema = createSelectSchema(chatMessage);
export type ChatMessageSelectSchema = z.infer<typeof chatMessageSelectSchema>;
export const chatMessageCreateSchema = createInsertSchema(chatMessage);
export type ChatMessageCreateSchema = z.infer<typeof chatMessageCreateSchema>;
export type ICreateChatMessage = Omit<
  ChatMessageCreateSchema,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;
