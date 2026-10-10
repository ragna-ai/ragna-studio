import { createMedia, db, getOrganizationIdByUserId, sql } from '@repo/database';
import { organization, user, type Media } from '@repo/database/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

export async function requireOrganizationId(userId: string): Promise<string> {
  const organizationId = await getOrganizationIdByUserId({ userId });
  if (!organizationId) {
    throw new Error(`User ${userId} has no organization`);
  }
  return organizationId;
}

export async function softDeleteOrganizationAt({
  organizationId,
  deletedAt,
}: {
  organizationId: string;
  deletedAt: Date;
}): Promise<void> {
  await db
    .update(organization)
    .set({ deletedAt })
    .where(sql`${organization.id} = ${organizationId}`);
}

export async function softDeleteUserAt({
  userId,
  deletedAt,
}: {
  userId: string;
  deletedAt: Date;
}): Promise<void> {
  await db
    .update(user)
    .set({ deletedAt })
    .where(sql`${user.id} = ${userId}`);
}

export interface SeedWorkspaceMediaParams {
  workspaceId: string;
  bucket?: string;
  storageKey?: string;
  createdAt?: Date;
}

export function seedWorkspaceMedia({
  workspaceId,
  bucket = 'test-documents',
  storageKey = `workspaces/${workspaceId}/${crypto.randomUUID()}.pdf`,
  createdAt,
}: SeedWorkspaceMediaParams): Promise<Media> {
  return createMedia({
    ownerWorkspaceId: workspaceId,
    bucket,
    storageKey,
    filename: 'file.pdf',
    mimeType: 'application/pdf',
    size: 10,
    origin: 'uploaded',
    createdAt,
  });
}

export async function organizationExists(organizationId: string): Promise<boolean> {
  const found = await db.query.organization.findFirst({ where: { id: organizationId } });
  return found !== undefined;
}

export async function userExists(userId: string): Promise<boolean> {
  const found = await db.query.user.findFirst({ where: { id: userId } });
  return found !== undefined;
}
