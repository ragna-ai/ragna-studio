import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import type { AgentContextDocument, NewAgentContextDocument } from '../schema';
import { agentContextDocument } from '../schema';

export type {
  AgentContextDocument,
  AgentContextDocumentStatus,
  NewAgentContextDocument,
} from '../schema';

export async function createAgentContextDocuments(
  records: NewAgentContextDocument[],
): Promise<AgentContextDocument[]> {
  if (records.length === 0) {
    return [];
  }

  return db.insert(agentContextDocument).values(records).returning();
}

export async function getAgentContextDocumentsByAgentId({
  agentId,
}: {
  agentId: string;
}): Promise<AgentContextDocument[]> {
  return db.query.agentContextDocument.findMany({
    where: { agentId },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
}

// Callers already resolved the agent via `getAgentByIdAndWorkspaceId`; this confirms the document belongs to it.
export async function getAgentContextDocumentByIdAndAgentId({
  id,
  agentId,
}: {
  id: string;
  agentId: string;
}): Promise<AgentContextDocument | null> {
  const found = await db.query.agentContextDocument.findFirst({
    where: { id, agentId },
  });

  return found ?? null;
}

// Plain lookup by id, no ownership scoping. Used by the extraction worker,
// which only ever receives a trusted `documentId` from its own job data.
export async function getAgentContextDocumentById({
  id,
}: {
  id: string;
}): Promise<AgentContextDocument | null> {
  const found = await db.query.agentContextDocument.findFirst({
    where: { id },
  });

  return found ?? null;
}

type UpdateAgentContextDocumentFields = Partial<
  Pick<
    NewAgentContextDocument,
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
export async function updateAgentContextDocument({
  id,
  agentId,
  ...fields
}: {
  id: string;
  agentId: string;
} & UpdateAgentContextDocumentFields): Promise<AgentContextDocument | null> {
  const [updated] = await db
    .update(agentContextDocument)
    .set(fields)
    .where(and(eq(agentContextDocument.id, id), eq(agentContextDocument.agentId, agentId)))
    .returning();

  return updated ?? null;
}

export async function deleteAgentContextDocumentById({
  id,
  agentId,
}: {
  id: string;
  agentId: string;
}): Promise<void> {
  await db
    .delete(agentContextDocument)
    .where(and(eq(agentContextDocument.id, id), eq(agentContextDocument.agentId, agentId)));
}

// Every non-`pending` document across all agents, for the chunk backfill
// script:
// re-running extraction on these produces chunks for documents that predate
// the chunk table, or re-embeds them if the embedding model ever changes.
export async function getNonPendingAgentContextDocumentIds(): Promise<string[]> {
  const rows = await db.query.agentContextDocument.findMany({
    where: { status: { ne: 'pending' } },
    columns: { id: true },
  });

  return rows.map((row) => row.id);
}

export type AgentContextDocumentForPrompt = { name: string; extractedText: string };

// Lean query for prompt assembly: only `ready` documents, oldest first, only
// the two fields `buildAgentInstructions()` renders. The extraction worker
// reuses this same query to compute the agent's other ready documents' total
// text length for the per-agent budget check, since it's the same set of
// rows either way.
export async function getReadyAgentContextDocumentsForPrompt({
  agentId,
}: {
  agentId: string;
}): Promise<AgentContextDocumentForPrompt[]> {
  const rows = await db.query.agentContextDocument.findMany({
    where: { agentId, status: 'ready' },
    columns: { name: true, extractedText: true },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });

  return rows
    .filter((row): row is { name: string; extractedText: string } => row.extractedText !== null)
    .map((row) => ({ name: row.name, extractedText: row.extractedText }));
}
