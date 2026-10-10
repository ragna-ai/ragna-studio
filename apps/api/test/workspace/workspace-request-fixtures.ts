import { db, sql } from '@repo/database';
import { user } from '@repo/database/schema';
import { app } from '../../src/app';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export function jsonRequest(cookieHeader: string, method: Method, path: string, body?: object) {
  return app.request(path, {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function softDeleteUser(userId: string): Promise<void> {
  await db
    .update(user)
    .set({ deletedAt: new Date() })
    .where(sql`${user.id} = ${userId}`);
}
