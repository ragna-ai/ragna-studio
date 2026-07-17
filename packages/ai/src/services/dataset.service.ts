import type { Dataset, DatasetColumn } from '@repo/database';
import { createDataset } from '@repo/database';

/**
 * Creates a dataset on behalf of an agent tool call (`datasetCreate`).
 * Always stamps `origin: 'agent'` (the grid badge) and the tool context's
 * `workspaceId`, so an agent's dataset lands in the same workspace as the
 * chat/workflow that created it (docs/datasets.md decision 11).
 */
export async function createDatasetForAgent({
  userId,
  workspaceId,
  name,
  description,
  columns,
}: {
  userId: string;
  workspaceId: string | null;
  name: string;
  description?: string;
  columns: DatasetColumn[];
}): Promise<Dataset> {
  return createDataset({
    userId,
    workspaceId,
    name,
    description,
    columns,
    origin: 'agent',
  });
}
