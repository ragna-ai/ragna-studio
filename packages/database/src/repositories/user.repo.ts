// src/repositories/user.repository.ts
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { user, type User } from '../schema';
import type { IUpdateUser, UserCreateSchema } from '../zod';
/**
 * Create a new user
 */
export async function createUser(payload: UserCreateSchema): Promise<User> {
  const [createdUser] = await db.insert(user).values(payload).returning();

  if (!createdUser) {
    throw new Error('Failed to create user');
  }

  return createdUser;
}

/**
 * Get user by ID
 */
export async function getUserById({ userId }: { userId: string }): Promise<User | null> {
  const userRecord = await db.query.user.findFirst({
    where: { id: userId },
  });

  return userRecord || null;
}

/**
 * Get user by email. Used by the credits grant script (specs/credits/prd.md,
 * "Grants") to resolve a human-provided email to a userId before granting.
 */
export async function getUserByEmail({ email }: { email: string }): Promise<User | null> {
  const userRecord = await db.query.user.findFirst({
    where: { email },
  });

  return userRecord || null;
}

// export async function getUserCreditBalance({ userId }: { userId: string }): Promise<number> {
//   const userRecord = await db.query.user.findFirst({
//     columns: { creditBalance: true },
//     where: { id: userId },
//   });

//   return userRecord?.creditBalance || 0;
// }

/**
 * Update user
 */
export async function updateUser(params: IUpdateUser): Promise<User> {
  const { id: userId, ...updateData } = params;

  if (!userId) {
    throw new Error('User ID is required for update');
  }

  const [updatedUser] = await db
    .update(user)
    .set(updateData)
    .where(eq(user.id, userId))
    .returning();

  if (!updatedUser) {
    throw new Error('Failed to update user');
  }

  return updatedUser;
}
