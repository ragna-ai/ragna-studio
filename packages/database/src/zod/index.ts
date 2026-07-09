import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/zod';
import type z from 'zod';
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
