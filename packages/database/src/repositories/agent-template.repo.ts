import { createPrimaryId } from '@repo/utils';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import type { Agent } from '../schema';
import { agent, agentTemplate } from '../schema';

export interface AgentTemplateListItem {
  id: string;
  name: string;
  description: string | null;
  aiModel: { displayName: string };
}

export async function listAgentTemplates(): Promise<AgentTemplateListItem[]> {
  const templates = await db.query.agentTemplate.findMany({
    columns: { id: true, name: true, description: true },
    with: { aiModel: { columns: { displayName: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    aiModel: { displayName: template.aiModel.displayName },
  }));
}

export interface CreateAgentFromTemplateParams {
  templateId: string;
  workspaceId: string;
  userId: string;
}

/** Copies a template into a new agent in one statement. Null when the template is unknown. */
export async function createAgentFromTemplate({
  templateId,
  workspaceId,
  userId,
}: CreateAgentFromTemplateParams): Promise<Agent | null> {
  const [createdAgent] = await db
    .insert(agent)
    .select(
      db
        .select({
          id: sql<string>`${createPrimaryId()}::text`.as('id'),
          userId: sql<string>`${userId}::text`.as('user_id'),
          workspaceId: sql<string>`${workspaceId}::text`.as('workspace_id'),
          aiModelId: agentTemplate.aiModelId,
          name: agentTemplate.name,
          description: agentTemplate.description,
          systemPrompt: agentTemplate.systemPrompt,
          tools: agentTemplate.tools,
          settings: agentTemplate.settings,
          updatedAt: sql<Date>`${new Date().toISOString()}::timestamp`.as('updated_at'),
        })
        .from(agentTemplate)
        .where(eq(agentTemplate.id, templateId)),
    )
    .returning();

  return createdAgent ?? null;
}
