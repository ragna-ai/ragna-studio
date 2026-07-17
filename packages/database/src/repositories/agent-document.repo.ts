import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { AgentDocument, NewAgentDocument } from '../schema';
import { agentDocument } from '../schema';

export type { AgentDocument, AgentDocumentStatus, NewAgentDocument } from '../schema';

export async function createAgentDocuments(
  records: NewAgentDocument[],
): Promise<AgentDocument[]> {
  if (records.length === 0) {
    return [];
  }

  return db.insert(agentDocument).values(records).returning();
}

export async function getAgentDocumentsByAgentId({
  agentId,
}: {
  agentId: string;
}): Promise<AgentDocument[]> {
  return db.query.agentDocument.findMany({
    where: { agentId },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
}

// Ownership-scoped lookup for API routes: callers already resolved the agent
// via `getAgentById({ agentId, userId })`, so this only needs to confirm the
// document belongs to that agent.
export async function getAgentDocumentByIdAndAgentId({
  id,
  agentId,
}: {
  id: string;
  agentId: string;
}): Promise<AgentDocument | null> {
  const found = await db.query.agentDocument.findFirst({
    where: { id, agentId },
  });

  return found ?? null;
}

// Plain lookup by id, no ownership scoping. Used by the extraction worker,
// which only ever receives a trusted `documentId` from its own job data.
export async function getAgentDocumentById({
  id,
}: {
  id: string;
}): Promise<AgentDocument | null> {
  const found = await db.query.agentDocument.findFirst({
    where: { id },
  });

  return found ?? null;
}

type UpdateAgentDocumentFields = Partial<
  Pick<
    NewAgentDocument,
    | 'name'
    | 'storageKey'
    | 'mimeType'
    | 'fileSize'
    | 'status'
    | 'extractedText'
    | 'isTruncated'
    | 'errorMessage'
  >
>;

// `agentId` is always required in the WHERE clause, even though every caller
// has already loaded the row once to check ownership, so a mistaken id from
// one agent can never overwrite a document belonging to another.
export async function updateAgentDocument({
  id,
  agentId,
  ...fields
}: { id: string; agentId: string } & UpdateAgentDocumentFields): Promise<AgentDocument | null> {
  const [updated] = await db
    .update(agentDocument)
    .set(fields)
    .where(and(eq(agentDocument.id, id), eq(agentDocument.agentId, agentId)))
    .returning();

  return updated ?? null;
}

export async function deleteAgentDocumentById({
  id,
  agentId,
}: {
  id: string;
  agentId: string;
}): Promise<void> {
  await db
    .delete(agentDocument)
    .where(and(eq(agentDocument.id, id), eq(agentDocument.agentId, agentId)));
}

export type AgentDocumentForPrompt = { name: string; extractedText: string };

// Lean query for prompt assembly: only `ready` documents, oldest first, only
// the two fields `buildAgentInstructions()` renders. The extraction worker
// reuses this same query to compute the agent's other ready documents' total
// text length for the per-agent budget check, since it's the same set of
// rows either way.
export async function getReadyAgentDocumentsForPrompt({
  agentId,
}: {
  agentId: string;
}): Promise<AgentDocumentForPrompt[]> {
  const rows = await db.query.agentDocument.findMany({
    where: { agentId, status: 'ready' },
    columns: { name: true, extractedText: true },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });

  return rows
    .filter((row): row is { name: string; extractedText: string } => row.extractedText !== null)
    .map((row) => ({ name: row.name, extractedText: row.extractedText }));
}
