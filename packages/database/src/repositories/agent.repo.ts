import type { SQL } from 'drizzle-orm';
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { AgentLockedError } from '../errors';
import type { Agent, StoredAgentToolGrant } from '../schema';
import { agent, task, taskComment, taskRun } from '../schema';
import type { ICreateAgent } from '../zod';

export type { Agent, AgentReasoningEffort, AgentSettings, StoredAgentToolGrant } from '../schema';

// Every agent now lives in exactly one workspace (workspaceId is NOT NULL),
// so "scope" is always a concrete (userId, workspaceId) pair; there is no
// more "unassigned" scope to fall back to.
type UpdateAgentFields = Partial<
  Pick<
    ICreateAgent,
    | 'name'
    | 'description'
    | 'aiModelId'
    | 'systemPrompt'
    | 'context'
    | 'toolGrants'
    | 'settings'
    | 'defaultDatasetId'
    | 'icon'
    | 'tone'
    | 'imageMediaId'
  >
>;

/**
 * Relation to load wherever an agent's mark is shown. The API turns the storage key into the
 * image URL; the database package has no storage dependency.
 */
export const agentImageMediaWith = { imageMedia: { columns: { storageKey: true } } } as const;

export interface AgentMarkMedia {
  imageMedia: { storageKey: string } | null;
}

/**
 * Relation to load wherever an agent's lock is shown: the locked version and who locked and
 * approved it. Names only, no other user columns.
 */
export const agentLockedVersionWith = {
  lockedVersion: {
    columns: {
      id: true,
      versionNumber: true,
      lockedAt: true,
      approvedAt: true,
      revokedAt: true,
    },
    with: {
      lockedBy: { columns: { id: true, name: true } },
      approvedBy: { columns: { id: true, name: true } },
    },
  },
} as const;

/** Sorted by id so equal grants always serialize to equal jsonb. */
export function sortToolGrantsById(toolGrants: StoredAgentToolGrant[]): StoredAgentToolGrant[] {
  return toolGrants.toSorted((first, second) => first.id.localeCompare(second.id, 'en'));
}

function unchangedValue(column: AnyPgColumn, value: unknown): SQL | undefined {
  return value === undefined ? undefined : sql`${column} is not distinct from ${value}`;
}

function unchangedJson(column: AnyPgColumn, value: unknown): SQL | undefined {
  return value === undefined
    ? undefined
    : sql`${column} is not distinct from ${JSON.stringify(value)}::jsonb`;
}

/** True when every field in `fields` already holds that value in the row. */
function fieldsUnchanged(fields: UpdateAgentFields): SQL | undefined {
  const comparisons = {
    name: unchangedValue(agent.name, fields.name),
    description: unchangedValue(agent.description, fields.description),
    icon: unchangedValue(agent.icon, fields.icon),
    tone: unchangedValue(agent.tone, fields.tone),
    imageMediaId: unchangedValue(agent.imageMediaId, fields.imageMediaId),
    aiModelId: unchangedValue(agent.aiModelId, fields.aiModelId),
    systemPrompt: unchangedValue(agent.systemPrompt, fields.systemPrompt),
    context: unchangedValue(agent.context, fields.context),
    toolGrants: unchangedJson(agent.toolGrants, fields.toolGrants),
    defaultDatasetId: unchangedValue(agent.defaultDatasetId, fields.defaultDatasetId),
    settings: unchangedJson(agent.settings, fields.settings),
  } satisfies Record<keyof UpdateAgentFields, SQL | undefined>;

  return and(...Object.values(comparisons));
}

export async function createAgent(values: ICreateAgent): Promise<Agent> {
  const {
    userId,
    workspaceId,
    name,
    description,
    aiModelId,
    systemPrompt,
    context,
    toolGrants,
    settings,
    defaultDatasetId,
    icon,
    tone,
    imageMediaId,
  } = values;

  const [createdAgent] = await db
    .insert(agent)
    .values({
      userId,
      workspaceId,
      aiModelId,
      name,
      description,
      systemPrompt,
      context,
      toolGrants: toolGrants && sortToolGrantsById(toolGrants),
      defaultDatasetId,
      icon,
      tone,
      imageMediaId,
      // Omit when unset so the column's $defaultFn default applies.
      ...(settings !== undefined ? { settings } : {}),
    })
    .returning();

  if (!createdAgent) {
    throw new Error('Failed to create agent');
  }

  return createdAgent;
}

export async function getAgentCountByWorkspaceId({
  workspaceId,
  searchQuery,
}: {
  workspaceId: string;
  searchQuery?: string;
}): Promise<number> {
  return db.$count(agent, agentListFilter(agent, { workspaceId, searchQuery }));
}

function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

/** Every whitespace-separated term must match the agent's name or description, case-insensitively. */
function agentListFilter(
  columns: Pick<typeof agent, 'workspaceId' | 'name' | 'description'>,
  { workspaceId, searchQuery }: { workspaceId: string; searchQuery?: string },
): SQL | undefined {
  const searchTerms = searchQuery?.split(/\s+/).filter((term) => term.length > 0) ?? [];
  return and(
    eq(columns.workspaceId, workspaceId),
    ...searchTerms.map((term) => {
      const pattern = `%${escapeLikePattern(term)}%`;
      return or(ilike(columns.name, pattern), ilike(columns.description, pattern));
    }),
  );
}

// Plain lookup by id (with its model and mark image), scoped by workspace only: the workspace guard already
// proved the caller owns `workspaceId`, so access control ends there.
export async function getAgentByIdAndWorkspaceId({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
}) {
  const agentRecord = await db.query.agent.findFirst({
    where: { id: agentId, workspaceId },
    with: {
      aiModel: true,
      ...agentImageMediaWith,
      ...agentLockedVersionWith,
    },
  });

  return agentRecord ?? null;
}

/** Looks up an agent by id, only if it lives in the user's private workspace. */
export async function getAgentInPersonalWorkspace({
  agentId,
  userId,
}: {
  agentId: string;
  userId: string;
}): Promise<Agent | null> {
  const agentRecord = await db.query.agent.findFirst({
    where: { id: agentId, workspace: { personalUserId: userId } },
    with: {
      aiModel: true,
    },
  });

  return agentRecord ?? null;
}

export interface ResolveEmailDraftAgentParams {
  userId: string;
  overrideAgentId?: string | null;
  defaultAgentId?: string | null;
}

/**
 * Picks the agent that drafts an email reply: the override, else the stored default.
 * Candidates outside the private workspace are skipped. Returns null when neither resolves.
 */
export async function resolveEmailDraftAgent({
  userId,
  overrideAgentId,
  defaultAgentId,
}: ResolveEmailDraftAgentParams): Promise<Agent | null> {
  const candidateIds = [overrideAgentId, defaultAgentId].filter((id): id is string => !!id);
  if (candidateIds.length > 0) {
    const privateAgents = await db.query.agent.findMany({
      where: { id: { in: candidateIds }, workspace: { personalUserId: userId } },
      with: {
        aiModel: true,
      },
    });
    const preferredAgent = candidateIds
      .map((id) => privateAgents.find((privateAgent) => privateAgent.id === id))
      .find((privateAgent) => privateAgent !== undefined);
    if (preferredAgent) {
      return preferredAgent;
    }
  }

  return null;
}

export async function getAgentsByWorkspaceId({
  workspaceId,
  limit,
  sort = 'desc',
  offset,
  searchQuery,
}: {
  workspaceId: string;
  searchQuery?: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}) {
  const agents = await db.query.agent.findMany({
    columns: {
      id: true,
      name: true,
      description: true,
      toolGrants: true,
      icon: true,
      tone: true,
      createdAt: true,
      updatedAt: true,
    },
    where: { RAW: (table) => agentListFilter(table, { workspaceId, searchQuery }) ?? sql`true` },
    with: {
      ...agentImageMediaWith,
      ...agentLockedVersionWith,
      aiModel: {
        columns: {
          provider: true,
          model: true,
          displayName: true,
        },
      },
    },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
  });

  return agents;
}

// `agentId`/`workspaceId` are always required in the WHERE clause, even
// though the caller already resolved the agent once via
// `getAgentByIdAndWorkspaceId()` to check ownership, so a mismatched id can
// never update a row outside the caller's workspace. Fields left out of
// `fields` are left untouched (partial update).
// On a locked agent the same WHERE clause also requires every field in `fields` to equal
// the stored value, so a save that repeats the locked values passes and a change throws.
export async function updateAgent({
  agentId,
  workspaceId,
  ...fields
}: {
  agentId: string;
  workspaceId: string;
} & UpdateAgentFields): Promise<Agent | null> {
  const sortedFields = {
    ...fields,
    toolGrants: fields.toolGrants && sortToolGrantsById(fields.toolGrants),
  };
  const lockGuard = fieldsUnchanged(sortedFields);
  const [updatedAgent] = await db
    .update(agent)
    .set(sortedFields)
    .where(
      and(
        eq(agent.id, agentId),
        eq(agent.workspaceId, workspaceId),
        lockGuard && or(isNull(agent.lockedVersionId), lockGuard),
      ),
    )
    .returning();

  if (updatedAgent) return updatedAgent;

  const existingAgent = await db.query.agent.findFirst({
    where: { id: agentId, workspaceId },
    columns: { id: true },
  });
  if (existingAgent) throw new AgentLockedError();
  return null;
}

// DELETE an agent by ID, scoped to its workspace. Refuses a locked agent. Its versions stay
// behind with no agent.
export async function deleteAgentById({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [lockedRow] = await tx
      .select({ lockedVersionId: agent.lockedVersionId })
      .from(agent)
      .where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId)))
      .for('update');
    if (lockedRow?.lockedVersionId) throw new AgentLockedError();

    await tx
      .update(task)
      .set({ assignedAgentId: null })
      .where(and(eq(task.assignedAgentId, agentId), eq(task.workspaceId, workspaceId)));
    await tx
      .update(taskComment)
      .set({ authorAgentId: null })
      .where(and(eq(taskComment.authorAgentId, agentId), eq(taskComment.workspaceId, workspaceId)));
    await tx
      .update(taskRun)
      .set({ agentId: null })
      .where(and(eq(taskRun.agentId, agentId), eq(taskRun.workspaceId, workspaceId)));
    await tx.delete(agent).where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId)));
  });
}
