import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { GenVideo, GenVideoStatus, GenVideoWithMedia, NewGenVideo } from '../schema';
import { genVideo } from '../schema';

export type {
  GenVideo,
  GenVideoAspectRatio,
  GenVideoFrameOrigin,
  GenVideoResolution,
  GenVideoStatus,
  GenVideoWithMedia,
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
// workspace guard upstream, so this doesn't
// filter by userId. Joins the output and first-frame media rows (both
// nullable: the pending/processing lifecycle means no object exists yet),
// so callers never need a second round trip to resolve a storage key.
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
}): Promise<GenVideoWithMedia[]> {
  return db.query.genVideo.findMany({
    where: { workspaceId },
    orderBy: (t, { asc, desc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
    limit,
    offset,
    with: { media: true, frameMedia: true },
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
// trusted genVideoId (their own job data or a row they just created). Joined
// the same way as getGenVideosByWorkspaceId, for the same reason.
export async function getGenVideoById({ id }: { id: string }): Promise<GenVideoWithMedia | null> {
  const found = await db.query.genVideo.findFirst({
    where: { id },
    with: { media: true, frameMedia: true },
  });

  return found ?? null;
}

// One-enhance-per-draft check: a
// pending/processing/completed enhance already covers the draft, only a
// failed one may be retried, so failed rows are excluded here rather than
// left for the caller to filter.
export async function getEnhanceForGenVideo({
  parentGenVideoId,
}: {
  parentGenVideoId: string;
}): Promise<GenVideo | null> {
  const found = await db.query.genVideo.findFirst({
    where: { parentGenVideoId, status: { ne: 'failed' } },
  });

  return found ?? null;
}

// Workspace-scoped delete-and-return: the service needs the deleted row's
// mediaId/frameMediaId afterward to refcount-delete their media,
// so this stays unjoined.
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

// visibleWatermark included:
// the completion update flips it from "requested" to "actually applied"
// when the watermark attempt failed, so runGenVideo (@repo/ai) needs to set
// it alongside status/mediaId/draftCacheKey on the same call.
type UpdateGenVideoFields = Partial<
  Pick<NewGenVideo, 'mediaId' | 'error' | 'draftCacheKey' | 'visibleWatermark'>
>;

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
