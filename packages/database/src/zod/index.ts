import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/zod';
import type z from 'zod';
import { agent, aiModel, chat, chatMessage } from '../schema';
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
export const agentSelectSchema = createSelectSchema(agent);
export type AgentSelectSchema = z.infer<typeof agentSelectSchema>;
export const agentCreateSchema = createInsertSchema(agent);
export type AgentCreateSchema = z.infer<typeof agentCreateSchema>;
export type ICreateAgent = Omit<AgentCreateSchema, 'id' | 'createdAt' | 'updatedAt'>;
export const agentUpdateSchema = createUpdateSchema(agent);
export type AgentUpdateSchema = z.infer<typeof agentUpdateSchema>;
export type IUpdateAgent = Partial<AgentUpdateSchema>;
// export const agentToolsSchema = z.enum(agentTools);

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
