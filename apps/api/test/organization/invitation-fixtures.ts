import { db } from '@repo/database';
import { invitation } from '@repo/database/schema';
import * as z from 'zod';
import { app } from '../../src/app';

const sessionBodySchema = z.object({
  session: z.object({ activeOrganizationId: z.string() }),
});

export async function activeOrganizationId(cookieHeader: string): Promise<string> {
  const response = await app.request('/auth/get-session', { headers: { cookie: cookieHeader } });
  return sessionBodySchema.parse(await response.json()).session.activeOrganizationId;
}

interface PendingInvitationInput {
  organizationId: string;
  inviterId: string;
  email: string;
  role?: string;
  expiresAt?: Date;
  createdAt?: Date;
}

export async function insertInvitation({
  organizationId,
  inviterId,
  email,
  role = 'member',
  expiresAt = new Date(Date.now() + 48 * 3_600_000),
  createdAt = new Date(),
}: PendingInvitationInput): Promise<string> {
  const [row] = await db
    .insert(invitation)
    .values({ organizationId, inviterId, email, role, expiresAt, createdAt })
    .returning({ id: invitation.id });
  if (!row) throw new Error('Failed to insert invitation');
  return row.id;
}

export async function postOrganizationRoute(cookieHeader: string, route: string, body: object) {
  return app.request(`/auth/organization/${route}`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
