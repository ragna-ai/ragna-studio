import { db } from '../db';
import type { GenImage, NewGenImage } from '../schema';
import { genImage } from '../schema';

export type { GenImage } from '../schema';

export async function createGenImageRecords(records: NewGenImage[]): Promise<GenImage[]> {
  return db.insert(genImage).values(records).returning();
}

export async function getGenImagesByUserId({ userId }: { userId: string }): Promise<GenImage[]> {
  return db.query.genImage.findMany({
    where: { userId },
    orderBy: (t, { desc }) => desc(t.createdAt),
  });
}

// Ownership check for attaching gen images to another record (e.g. a
// LinkedIn draft): only returns rows that belong to userId, so a caller can
// tell an attempt to reuse someone else's image apart from a typo'd id by
// comparing the result length against the requested ids.
export async function getGenImagesByIds({
  ids,
  userId,
}: {
  ids: string[];
  userId: string;
}): Promise<GenImage[]> {
  if (ids.length === 0) {
    return [];
  }

  return db.query.genImage.findMany({
    where: { id: { in: ids }, userId },
  });
}
