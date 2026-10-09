import { db, sql } from '@repo/database';
import { user } from '@repo/database/schema';
import { seedAuthenticatedUser } from '@repo/testing';
import { app } from '../../src/app';

export async function memberIdOf(userId: string): Promise<string> {
  const row = await db.query.organizationMember.findFirst({ where: { userId } });
  if (!row) throw new Error(`User ${userId} has no membership`);
  return row.id;
}

export function organizationRequest(
  cookieHeader: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: object,
) {
  return app.request(`/organization${path}`, {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Starts a session for the user through a real auth endpoint (platform-admin
 * impersonation), the only path where the ban check runs in tests.
 */
export async function startSessionFor(userId: string) {
  const platformAdmin = await seedAuthenticatedUser();
  await db
    .update(user)
    .set({ role: 'admin' })
    .where(sql`${user.id} = ${platformAdmin.userId}`);
  return app.request('/auth/admin/impersonate-user', {
    method: 'POST',
    headers: { cookie: platformAdmin.cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}

export async function markUserBanned(userId: string, banReason: string): Promise<void> {
  await db
    .update(user)
    .set({ banned: true, banReason })
    .where(sql`${user.id} = ${userId}`);
}
