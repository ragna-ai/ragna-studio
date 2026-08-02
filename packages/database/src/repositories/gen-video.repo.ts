import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { GenVideo, GenVideoStatus, NewGenVideo } from '../schema';
import { genVideo } from '../schema';

export type {
  GenVideo,
  GenVideoAspectRatio,
  GenVideoFrameOrigin,
  GenVideoResolution,
  GenVideoStatus,
  NewGenVideo,
} from '../schema';

export async function createGenVideoRecord(record: NewGenVideo): Promise<GenVideo> {
  const [created] = await db.insert(genVideo).values(record).returning();

  if (!created) {
    throw new Error('Failed to create gen video record');
  }

  return created;
}

// Workspace-scoped list, newest first by default. Access is gated by the
// workspace guard upstream (docs/api-standards/prd.md), so this doesn't
// filter by userId.
export async function getGenVideosByWorkspaceId({
  workspaceId,
  limit,
  offset,
  sort = 'desc',
}: {
  workspaceId: string;
  limit: number;
  offset: number;
  sort?: 'asc' | 'desc';
}): Promise<GenVideo[]> {
  return db.query.genVideo.findMany({
    where: { workspaceId },
    orderBy: (t, { asc, desc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
    limit,
    offset,
  });
}

// Matches the filters of getGenVideosByWorkspaceId exactly, for pagination meta.
export async function getGenVideoCountByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  return db.$count(genVideo, eq(genVideo.workspaceId, workspaceId));
}

// Plain lookup by id, no ownership scoping. Used by the gen-video worker and
// the awaited inline workflow path, both of which only ever receive a
// trusted genVideoId (their own job data or a row they just created).
export async function getGenVideoById({ id }: { id: string }): Promise<GenVideo | null> {
  const found = await db.query.genVideo.findFirst({
    where: { id },
  });

  return found ?? null;
}

// Workspace-scoped delete-and-return: the service needs the deleted row's
// storageKey/frameStorageKey afterward to best-effort clean up its R2 objects.
export async function deleteGenVideoByIdAndWorkspaceId({
  id,
  workspaceId,
}: {
  id: string;
  workspaceId: string;
}): Promise<GenVideo | null> {
  const [deleted] = await db
    .delete(genVideo)
    .where(and(eq(genVideo.id, id), eq(genVideo.workspaceId, workspaceId)))
    .returning();

  return deleted ?? null;
}

type UpdateGenVideoFields = Partial<Pick<NewGenVideo, 'storageKey' | 'error'>>;

export async function updateGenVideoStatus({
  id,
  status,
  ...fields
}: { id: string; status: GenVideoStatus } & UpdateGenVideoFields): Promise<GenVideo> {
  const [updated] = await db
    .update(genVideo)
    .set({ status, ...fields })
    .where(eq(genVideo.id, id))
    .returning();

  if (!updated) {
    throw new Error('Failed to update gen video status');
  }

  return updated;
}
