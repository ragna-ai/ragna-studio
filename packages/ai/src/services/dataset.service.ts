import type { Dataset, DatasetColumn, DatasetOrigin } from '@repo/database';
import { createDataset } from '@repo/database';

export interface CreateDatasetForAgentInput {
  userId: string;
  workspaceId: string;
  name: string;
  description?: string;
  columns: DatasetColumn[];
  origin: DatasetOrigin;
}

// Stamps the calling tool's origin (agent chat vs. MCP) so a created
// dataset lands in the same workspace as its caller (docs/datasets.md
// decision 11) with the correct grid badge (PRD docs/mcp/prd.md P6).
export async function createDatasetForAgent({
  userId,
  workspaceId,
  name,
  description,
  columns,
  origin,
}: CreateDatasetForAgentInput): Promise<Dataset> {
  return createDataset({ userId, workspaceId, name, description, columns, origin });
}
