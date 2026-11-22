// One-time backfill: fills `workflows.agent_ids` for workflows published before the column existed.
// The ids come from the same function the publish path uses, never from a JSON path query.
//
// Usage: pnpm --filter @repo/database workflows:backfill-agent-ids

import { getWorkflowAgentIds } from '@repo/workflow';
import { sql } from 'drizzle-orm';
import { db } from '../db';

async function main() {
  const publishedWorkflows = await db.query.workflow.findMany({
    columns: { id: true, publishedDefinition: true },
    where: { publishedDefinition: { isNotNull: true } },
  });

  const rowsWithAgents = publishedWorkflows.flatMap((publishedWorkflow) => {
    if (!publishedWorkflow.publishedDefinition) return [];
    const agentIds = getWorkflowAgentIds(publishedWorkflow.publishedDefinition);
    return agentIds.length > 0 ? [{ id: publishedWorkflow.id, agentIds }] : [];
  });

  if (rowsWithAgents.length === 0) {
    console.log('No published workflow references an agent. Nothing to backfill.');
    return;
  }

  await db.execute(sql`
    update workflows
    set agent_ids = array(select jsonb_array_elements_text(backfill."agentIds"))
    from jsonb_to_recordset(${JSON.stringify(rowsWithAgents)}::jsonb)
      as backfill(id text, "agentIds" jsonb)
    where workflows.id = backfill.id
  `);

  console.log(`Backfilled agent ids for ${rowsWithAgents.length} published workflows.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
