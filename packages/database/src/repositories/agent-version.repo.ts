import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import type { AgentVersion, AgentVersionConfig } from '../schema';
import { agent, agentContextDocument, agentVersion, task, workflow, workspace } from '../schema';
import { sortToolGrantsById } from './agent.repo';

export type { AgentVersion, AgentVersionConfig } from '../schema';

type AgentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AgentRow = typeof agent.$inferSelect;

interface AgentScope {
  agentId: string;
  workspaceId: string;
}

interface AgentActor extends AgentScope {
  userId: string;
}

/** Statuses of a task that still waits for work: an unlock changes what these tasks run with. */
const OPEN_TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review'] as const;

export type LockAgentResult =
  | { status: 'locked'; version: AgentVersion }
  | { status: 'not-found' | 'already-locked' | 'knowledge-files-not-ready' };

export type ApproveAgentResult =
  | { status: 'approved'; version: AgentVersion }
  | { status: 'not-found' | 'already-approved' | 'knowledge-files-not-ready' };

export type UnlockAgentResult =
  | { status: 'unlocked'; version: AgentVersion }
  | { status: 'not-locked' };

interface KnowledgeFiles {
  ids: string[];
  allReady: boolean;
}

/** Takes the row lock that every lock, approve and knowledge file write queues behind. */
async function selectAgentForUpdate(
  tx: AgentTransaction,
  { agentId, workspaceId }: AgentScope,
): Promise<AgentRow | null> {
  const [agentRow] = await tx
    .select()
    .from(agent)
    .where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId)))
    .for('update');
  return agentRow ?? null;
}

async function getKnowledgeFiles(tx: AgentTransaction, agentId: string): Promise<KnowledgeFiles> {
  const files = await tx
    .select({ id: agentContextDocument.id, status: agentContextDocument.status })
    .from(agentContextDocument)
    .where(eq(agentContextDocument.agentId, agentId))
    .orderBy(agentContextDocument.createdAt);

  return {
    ids: files.map((file) => file.id),
    allReady: files.every((file) => file.status === 'ready'),
  };
}

function snapshotAgentConfig(agentRow: AgentRow): AgentVersionConfig {
  return {
    aiModelId: agentRow.aiModelId,
    systemPrompt: agentRow.systemPrompt,
    context: agentRow.context,
    toolGrants: sortToolGrantsById(agentRow.toolGrants),
    defaultDatasetId: agentRow.defaultDatasetId,
    settings: agentRow.settings,
  };
}

interface InsertVersionParams {
  agentRow: AgentRow;
  userId: string;
  config: AgentVersionConfig;
  knowledgeDocumentIds: string[];
  approved: boolean;
}

/** Inserts the next version of the agent and points the agent at it. The caller holds the agent row lock. */
async function insertVersionAndLock(
  tx: AgentTransaction,
  { agentRow, userId, config, knowledgeDocumentIds, approved }: InsertVersionParams,
): Promise<AgentVersion> {
  const [latest] = await tx
    .select({ versionNumber: sql<number>`coalesce(max(${agentVersion.versionNumber}), 0)` })
    .from(agentVersion)
    .where(eq(agentVersion.agentId, agentRow.id));
  const now = new Date();

  const [insertedVersion] = await tx
    .insert(agentVersion)
    .values({
      workspaceId: agentRow.workspaceId,
      agentId: agentRow.id,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      config,
      knowledgeDocumentIds,
      lockedByUserId: userId,
      lockedAt: now,
      ...(approved ? { approvedByUserId: userId, approvedAt: now } : {}),
    })
    .returning();
  if (!insertedVersion) throw new Error('Failed to insert agent version');

  await tx
    .update(agent)
    .set({ lockedVersionId: insertedVersion.id, toolGrants: config.toolGrants })
    .where(and(eq(agent.id, agentRow.id), eq(agent.workspaceId, agentRow.workspaceId)));

  return insertedVersion;
}

/** Freezes the agent's current configuration as its next version. */
export async function lockAgent({
  agentId,
  workspaceId,
  userId,
}: AgentActor): Promise<LockAgentResult> {
  return db.transaction(async (tx) => {
    const agentRow = await selectAgentForUpdate(tx, { agentId, workspaceId });
    if (!agentRow) return { status: 'not-found' };
    if (agentRow.lockedVersionId) return { status: 'already-locked' };

    const knowledgeFiles = await getKnowledgeFiles(tx, agentId);
    if (!knowledgeFiles.allReady) return { status: 'knowledge-files-not-ready' };

    const version = await insertVersionAndLock(tx, {
      agentRow,
      userId,
      config: snapshotAgentConfig(agentRow),
      knowledgeDocumentIds: knowledgeFiles.ids,
      approved: false,
    });
    return { status: 'locked', version };
  });
}

/**
 * Approves the agent for unattended runs. An unlocked agent is locked in the same step. A
 * revoked version keeps its history: its configuration goes into a new, approved version.
 */
export async function approveAgent({
  agentId,
  workspaceId,
  userId,
}: AgentActor): Promise<ApproveAgentResult> {
  return db.transaction(async (tx) => {
    const agentRow = await selectAgentForUpdate(tx, { agentId, workspaceId });
    if (!agentRow) return { status: 'not-found' };

    const currentVersion = agentRow.lockedVersionId
      ? await tx.query.agentVersion.findFirst({ where: { id: agentRow.lockedVersionId } })
      : undefined;
    if (currentVersion?.approvedAt && !currentVersion.revokedAt) {
      return { status: 'already-approved' };
    }

    const knowledgeFiles = await getKnowledgeFiles(tx, agentId);
    if (!knowledgeFiles.allReady) return { status: 'knowledge-files-not-ready' };

    if (currentVersion && !currentVersion.approvedAt) {
      const [approvedVersion] = await tx
        .update(agentVersion)
        .set({ approvedByUserId: userId, approvedAt: new Date() })
        .where(eq(agentVersion.id, currentVersion.id))
        .returning();
      if (!approvedVersion) throw new Error('Failed to approve agent version');
      return { status: 'approved', version: approvedVersion };
    }

    const version = await insertVersionAndLock(tx, {
      agentRow,
      userId,
      config: currentVersion ? currentVersion.config : snapshotAgentConfig(agentRow),
      knowledgeDocumentIds: currentVersion
        ? currentVersion.knowledgeDocumentIds
        : knowledgeFiles.ids,
      approved: true,
    });
    return { status: 'approved', version };
  });
}

/** Records the revoke on the agent's current version. Null when it has no live approval. */
export async function revokeAgentApproval({
  agentId,
  workspaceId,
  userId,
}: AgentActor): Promise<AgentVersion | null> {
  const [revokedVersion] = await db
    .update(agentVersion)
    .set({ revokedByUserId: userId, revokedAt: new Date() })
    .where(
      and(
        inArray(
          agentVersion.id,
          db
            .select({ id: agent.lockedVersionId })
            .from(agent)
            .where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId))),
        ),
        isNotNull(agentVersion.approvedAt),
        isNull(agentVersion.revokedAt),
      ),
    )
    .returning();

  return revokedVersion ?? null;
}

/** Records the unlock on the agent's current version and makes the agent editable again. */
export async function unlockAgent({
  agentId,
  workspaceId,
  userId,
}: AgentActor): Promise<UnlockAgentResult> {
  return db.transaction(async (tx) => {
    const [unlockedVersion] = await tx
      .update(agentVersion)
      .set({ unlockedByUserId: userId, unlockedAt: new Date() })
      .where(
        and(
          inArray(
            agentVersion.id,
            tx
              .select({ id: agent.lockedVersionId })
              .from(agent)
              .where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId))),
          ),
          isNull(agentVersion.unlockedAt),
        ),
      )
      .returning();
    if (!unlockedVersion) return { status: 'not-locked' };

    await tx
      .update(agent)
      .set({ lockedVersionId: null })
      .where(and(eq(agent.id, agentId), eq(agent.workspaceId, workspaceId)));
    return { status: 'unlocked', version: unlockedVersion };
  });
}

/** Versions of an agent, newest first, with the names of the users in their history. */
export async function listAgentVersions({ agentId, workspaceId }: AgentScope) {
  return db.query.agentVersion.findMany({
    where: { agentId, workspaceId },
    columns: {
      id: true,
      versionNumber: true,
      lockedAt: true,
      approvedAt: true,
      revokedAt: true,
      unlockedAt: true,
    },
    with: {
      lockedBy: { columns: { id: true, name: true } },
      approvedBy: { columns: { id: true, name: true } },
      revokedBy: { columns: { id: true, name: true } },
      unlockedBy: { columns: { id: true, name: true } },
    },
    orderBy: { versionNumber: 'desc' },
  });
}

export interface AgentUsage {
  workflowCount: number;
  assignedTaskCount: number;
}

/** Live counts of the work an unlock touches, in one query. */
export async function getAgentUsage({ agentId, workspaceId }: AgentScope): Promise<AgentUsage> {
  const openTasks = and(
    eq(task.workspaceId, workspaceId),
    eq(task.assignedAgentId, agentId),
    inArray(task.status, [...OPEN_TASK_STATUSES]),
  );
  const workflowsWithAgent = and(
    eq(workflow.workspaceId, workspaceId),
    sql`${workflow.agentIds} @> ARRAY[${agentId}]::text[]`,
  );

  const [usage] = await db
    .select({
      workflowCount: sql<number>`(select count(*)::int from ${workflow} where ${workflowsWithAgent})`,
      assignedTaskCount: sql<number>`(select count(*)::int from ${task} where ${openTasks})`,
    })
    .from(workspace)
    .where(eq(workspace.id, workspaceId));

  return usage ?? { workflowCount: 0, assignedTaskCount: 0 };
}

/** The agent's current version, only while it carries a live approval. */
export async function getApprovedAgentVersion({
  agentId,
  workspaceId,
}: AgentScope): Promise<AgentVersion | null> {
  const [row] = await db
    .select({ version: agentVersion })
    .from(agent)
    .innerJoin(
      agentVersion,
      and(
        eq(agentVersion.id, agent.lockedVersionId),
        eq(agentVersion.workspaceId, agent.workspaceId),
      ),
    )
    .where(
      and(
        eq(agent.id, agentId),
        eq(agent.workspaceId, workspaceId),
        isNotNull(agentVersion.approvedAt),
        isNull(agentVersion.revokedAt),
      ),
    );

  return row?.version ?? null;
}

/** The versions with these ids, in one query. Unknown ids are simply absent. */
export async function listAgentVersionsByIds({
  versionIds,
}: {
  versionIds: string[];
}): Promise<AgentVersion[]> {
  if (versionIds.length === 0) return [];
  return db.select().from(agentVersion).where(inArray(agentVersion.id, versionIds));
}
