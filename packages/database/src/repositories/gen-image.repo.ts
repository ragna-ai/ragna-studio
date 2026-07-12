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
