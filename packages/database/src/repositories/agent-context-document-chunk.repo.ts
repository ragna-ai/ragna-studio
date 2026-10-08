import { and, asc, cosineDistance, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import type { NewAgentContextDocumentChunk } from '../schema';
import { agentContextDocument, agentContextDocumentChunk } from '../schema';

export type { AgentContextDocumentChunk, NewAgentContextDocumentChunk } from '../schema';

export interface ReplaceAgentContextDocumentChunksInput {
  documentId: string;
  agentId: string;
  extractedText: string;
  isTruncated: boolean;
  chunks: { chunkIndex: number; content: string; embedding: number[] }[];
}

// Runs as a single transaction so a `ready` document always has its chunks
// in place: the document row and its chunks flip together, never one
// without the other.
export async function replaceAgentContextDocumentChunksAndMarkReady({
  documentId,
  agentId,
  extractedText,
  isTruncated,
  chunks,
}: ReplaceAgentContextDocumentChunksInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(agentContextDocumentChunk)
      .where(eq(agentContextDocumentChunk.documentId, documentId));

    if (chunks.length > 0) {
      const records: NewAgentContextDocumentChunk[] = chunks.map((chunk) => ({
        documentId,
        agentId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding,
      }));

      await tx.insert(agentContextDocumentChunk).values(records);
    }

    await tx
      .update(agentContextDocument)
      .set({
        status: 'ready',
        extractedText,
        isTruncated,
        errorMessage: null,
      })
      .where(eq(agentContextDocument.id, documentId));
  });
}

export async function deleteAgentContextDocumentChunksByDocumentId({
  documentId,
}: {
  documentId: string;
}): Promise<void> {
  await db
    .delete(agentContextDocumentChunk)
    .where(eq(agentContextDocumentChunk.documentId, documentId));
}

export interface AgentContextDocumentChunkSearchResult {
  documentName: string;
  content: string;
  distance: number;
}

// Exact cosine scan over one agent's chunks, joined to `ready` documents so
// a document mid-replace drops out of search even if its old chunks still
// exist for a moment.
export async function searchAgentContextDocumentChunks({
  agentId,
  queryEmbedding,
  limit,
}: {
  agentId: string;
  queryEmbedding: number[];
  limit: number;
}): Promise<AgentContextDocumentChunkSearchResult[]> {
  const distance = sql<number>`${cosineDistance(agentContextDocumentChunk.embedding, queryEmbedding)}`;

  const rows = await db
    .select({
      documentName: agentContextDocument.name,
      content: agentContextDocumentChunk.content,
      distance,
    })
    .from(agentContextDocumentChunk)
    .innerJoin(
      agentContextDocument,
      eq(agentContextDocumentChunk.documentId, agentContextDocument.id),
    )
    .where(
      and(eq(agentContextDocumentChunk.agentId, agentId), eq(agentContextDocument.status, 'ready')),
    )
    .orderBy(asc(distance))
    .limit(limit);

  return rows;
}

export interface AgentContextDocumentMeta {
  id: string;
  name: string;
  charCount: number;
}

// Returns sizes only, never `extractedText` itself (up to 5MB per document),
// so prompt building can decide injection vs. retrieval mode without loading
// the text it might not even use.
export async function getReadyAgentContextDocumentMeta({
  agentId,
}: {
  agentId: string;
}): Promise<AgentContextDocumentMeta[]> {
  const rows = await db
    .select({
      id: agentContextDocument.id,
      name: agentContextDocument.name,
      charCount: sql<number>`length(${agentContextDocument.extractedText})`,
    })
    .from(agentContextDocument)
    .where(and(eq(agentContextDocument.agentId, agentId), eq(agentContextDocument.status, 'ready')))
    .orderBy(asc(agentContextDocument.createdAt));

  return rows;
}
