import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import type { Dataset, DatasetColumn, DatasetOrigin, DatasetRow, DatasetRowData } from '../schema';
import { dataset, datasetRow } from '../schema';

export type { Dataset, DatasetColumn, DatasetOrigin, DatasetRow, DatasetRowData } from '../schema';

// Size guardrails (docs/datasets.md decision 8): keep tool responses inside
// sane token budgets and the grid snappy.
export const MAX_COLUMNS_PER_DATASET = 20;
export const MAX_ROWS_PER_DATASET = 1000;
export const MAX_LIST_ROWS_LIMIT = 100;

export type DatasetWithRowCount = Dataset & { rowCount: number };

// VALIDATION (shared by the REST endpoints and the agent tools, per
// docs/datasets.md decision 2)

export type RowValidationResult = { valid: true } | { valid: false; error: string };

function validateValueForColumn(
  column: DatasetColumn,
  value: string | number | null,
): string | null {
  if (value === null) {
    return null;
  }

  if (column.type === 'number') {
    return typeof value === 'number' ? null : `Column "${column.name}" expects a numeric value`;
  }

  if (column.type === 'select') {
    if (typeof value !== 'string') {
      return `Column "${column.name}" expects a text value`;
    }
    return column.options?.includes(value)
      ? null
      : `"${value}" is not a valid option for column "${column.name}"`;
  }

  // 'text' and 'date' both store plain strings (date as ISO yyyy-mm-dd).
  return typeof value === 'string' ? null : `Column "${column.name}" expects a text value`;
}

/**
 * Validates a row's data against its dataset's column schema: every key
 * must be a known column id, and every value must match that column's type
 * (and, for `select`, one of its options). Used on every write path (grid
 * and agent tools) so a bad write becomes a visible error, not silent
 * corruption.
 */
export function validateRowData(
  columns: DatasetColumn[],
  data: DatasetRowData,
): RowValidationResult {
  const columnsById = new Map(columns.map((column) => [column.id, column]));

  for (const [columnId, value] of Object.entries(data)) {
    const column = columnsById.get(columnId);
    if (!column) {
      return { valid: false, error: `Unknown column "${columnId}"` };
    }

    const error = validateValueForColumn(column, value);
    if (error) {
      return { valid: false, error };
    }
  }

  return { valid: true };
}

function validateColumns(columns: DatasetColumn[]): RowValidationResult {
  if (columns.length > MAX_COLUMNS_PER_DATASET) {
    return {
      valid: false,
      error: `A dataset can have at most ${MAX_COLUMNS_PER_DATASET} columns`,
    };
  }

  const ids = new Set<string>();
  for (const column of columns) {
    if (ids.has(column.id)) {
      return { valid: false, error: `Duplicate column id "${column.id}"` };
    }
    ids.add(column.id);
  }

  return { valid: true };
}

// DATASET CRUD

export async function createDataset({
  userId,
  workspaceId,
  name,
  description,
  columns = [],
  origin = 'user',
}: {
  userId: string;
  workspaceId?: string | null;
  name: string;
  description?: string | null;
  columns?: DatasetColumn[];
  origin?: DatasetOrigin;
}): Promise<Dataset> {
  const columnsValidation = validateColumns(columns);
  if (!columnsValidation.valid) {
    throw new Error(columnsValidation.error);
  }

  const [createdDataset] = await db
    .insert(dataset)
    .values({ userId, workspaceId, name, description, columns, origin })
    .returning();

  if (!createdDataset) {
    throw new Error('Failed to create dataset');
  }

  return createdDataset;
}

export async function getDatasetById({
  datasetId,
  userId,
}: {
  datasetId: string;
  userId: string;
}): Promise<Dataset | null> {
  const datasetRecord = await db.query.dataset.findFirst({
    where: { id: datasetId, userId },
  });

  return datasetRecord ?? null;
}

export async function getDatasetCountByUserId({
  userId,
  workspaceId,
  unassigned,
}: {
  userId: string;
  workspaceId?: string;
  unassigned?: boolean;
}): Promise<number> {
  return db.$count(
    dataset,
    and(
      eq(dataset.userId, userId),
      unassigned
        ? isNull(dataset.workspaceId)
        : workspaceId
          ? eq(dataset.workspaceId, workspaceId)
          : undefined,
    ),
  );
}

/**
 * Paginated dataset list, scoped by userId with the standard three-state
 * workspace filter (docs/workspaces.md), reused as-is by the agent tools'
 * hard workspace filter (docs/datasets.md decision 11): the tool passes its
 * own `workspaceId` and never sets `unassigned`. Each dataset's row count
 * (soft-deleted rows excluded) is attached with one extra count query per
 * row, acceptable at the list's page-size caps.
 */
export async function getAllDatasetsByUserId({
  userId,
  workspaceId,
  unassigned,
  limit,
  sort = 'desc',
  offset,
}: {
  userId: string;
  workspaceId?: string;
  unassigned?: boolean;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}): Promise<DatasetWithRowCount[]> {
  const datasets = await db.query.dataset.findMany({
    where: { userId, workspaceId: unassigned ? { isNull: true } : workspaceId },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.updatedAt) : desc(t.updatedAt)),
  });

  const rowCounts = await Promise.all(
    datasets.map((datasetRecord) => getDatasetRowCount({ datasetId: datasetRecord.id })),
  );

  return datasets.map((datasetRecord, index) => ({
    ...datasetRecord,
    rowCount: rowCounts[index] ?? 0,
  }));
}

/**
 * Unpaginated find for the `datasetFind` agent tool, same scope rules as above.
 * The query is keyword-based, not a literal substring: every whitespace-separated
 * term must appear in the name or description (case-insensitive), so an
 * LLM-style query like "cake plan" matches "Cake Baking Plan".
 */
export async function findDatasetsForAgent({
  userId,
  workspaceId,
  query,
}: {
  userId: string;
  workspaceId?: string | null;
  query?: string;
}): Promise<Dataset[]> {
  const searchTerms = query?.split(/\s+/).filter((term) => term.length > 0) ?? [];

  return db.query.dataset.findMany({
    where: {
      userId,
      workspaceId: workspaceId ?? undefined,
      ...(searchTerms.length > 0
        ? {
            AND: searchTerms.map((term) => ({
              OR: [
                { name: { ilike: `%${term}%` } },
                { description: { ilike: `%${term}%` } },
              ],
            })),
          }
        : {}),
    },
    orderBy: (t, { desc }) => desc(t.updatedAt),
    limit: MAX_LIST_ROWS_LIMIT,
  });
}

export async function updateDataset({
  datasetId,
  userId,
  name,
  description,
  columns,
}: {
  datasetId: string;
  userId: string;
  name?: string;
  description?: string | null;
  // Retyping a column (e.g. select -> text) leaves existing row values
  // untouched (docs/datasets.md open question 3): they stay in jsonb as-is.
  columns?: DatasetColumn[];
}): Promise<Dataset> {
  if (columns) {
    const columnsValidation = validateColumns(columns);
    if (!columnsValidation.valid) {
      throw new Error(columnsValidation.error);
    }
  }

  const [updatedDataset] = await db
    .update(dataset)
    .set({ name, description, columns })
    .where(and(eq(dataset.id, datasetId), eq(dataset.userId, userId)))
    .returning();

  if (!updatedDataset) {
    throw new Error('Dataset not found');
  }

  return updatedDataset;
}

export async function deleteDatasetById({
  datasetId,
  userId,
}: {
  datasetId: string;
  userId: string;
}): Promise<void> {
  await db.delete(dataset).where(and(eq(dataset.id, datasetId), eq(dataset.userId, userId)));
}

// DATASET ROWS

export async function getDatasetRowCount({ datasetId }: { datasetId: string }): Promise<number> {
  return db.$count(
    datasetRow,
    and(eq(datasetRow.datasetId, datasetId), isNull(datasetRow.deletedAt)),
  );
}

export type DatasetRowFilter = { columnId: string; value: string | number | null };

/**
 * Rows for one dataset, oldest first (v1 has no manual reordering), always
 * excluding soft-deleted rows so an agent can never resurrect or
 * double-process a removed task. `filter` is an equality match on one
 * column's value (v1 scope for the `datasetListRows` tool); `limit` is
 * capped at `MAX_LIST_ROWS_LIMIT` regardless of what's requested.
 */
export async function getDatasetRows({
  datasetId,
  filter,
  limit,
}: {
  datasetId: string;
  filter?: DatasetRowFilter;
  limit?: number;
}): Promise<DatasetRow[]> {
  const cappedLimit = limit ? Math.min(limit, MAX_LIST_ROWS_LIMIT) : undefined;

  return db.query.datasetRow.findMany({
    where: {
      datasetId,
      deletedAt: { isNull: true },
      // jsonb equality on a specific key. `filter.value` is bound as a
      // query parameter, not concatenated, so this is not string-built SQL.
      ...(filter
        ? {
            RAW: (table) => sql`${table.data} ->> ${filter.columnId} = ${String(filter.value)}`,
          }
        : {}),
    },
    orderBy: (t, { asc }) => asc(t.createdAt),
    limit: cappedLimit,
  });
}

export async function getDatasetRowById({
  datasetId,
  rowId,
}: {
  datasetId: string;
  rowId: string;
}): Promise<DatasetRow | null> {
  const rowRecord = await db.query.datasetRow.findFirst({
    where: { id: rowId, datasetId, deletedAt: { isNull: true } },
  });

  return rowRecord ?? null;
}

export async function createDatasetRow({
  datasetId,
  userId,
  data,
}: {
  datasetId: string;
  userId: string;
  data: DatasetRowData;
}): Promise<DatasetRow> {
  const datasetRecord = await getDatasetById({ datasetId, userId });
  if (!datasetRecord) {
    throw new Error('Dataset not found');
  }

  const rowCount = await getDatasetRowCount({ datasetId });
  if (rowCount >= MAX_ROWS_PER_DATASET) {
    throw new Error(`Dataset has reached the ${MAX_ROWS_PER_DATASET}-row limit`);
  }

  const validation = validateRowData(datasetRecord.columns, data);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const [createdRow] = await db.insert(datasetRow).values({ datasetId, data }).returning();

  if (!createdRow) {
    throw new Error('Failed to create dataset row');
  }

  return createdRow;
}

export async function updateDatasetRow({
  datasetId,
  rowId,
  userId,
  data,
}: {
  datasetId: string;
  rowId: string;
  userId: string;
  // Partial: only the given columns are merged into the row's existing data.
  data: DatasetRowData;
}): Promise<DatasetRow> {
  const datasetRecord = await getDatasetById({ datasetId, userId });
  if (!datasetRecord) {
    throw new Error('Dataset not found');
  }

  const existingRow = await getDatasetRowById({ datasetId, rowId });
  if (!existingRow) {
    throw new Error('Dataset row not found');
  }

  const mergedData = { ...existingRow.data, ...data };
  const validation = validateRowData(datasetRecord.columns, mergedData);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const [updatedRow] = await db
    .update(datasetRow)
    .set({ data: mergedData })
    .where(eq(datasetRow.id, rowId))
    .returning();

  if (!updatedRow) {
    throw new Error('Failed to update dataset row');
  }

  return updatedRow;
}

/** Soft delete: sets `deletedAt` so every row read (grid + tools) excludes it. */
export async function softDeleteDatasetRow({
  datasetId,
  rowId,
  userId,
}: {
  datasetId: string;
  rowId: string;
  userId: string;
}): Promise<void> {
  const datasetRecord = await getDatasetById({ datasetId, userId });
  if (!datasetRecord) {
    throw new Error('Dataset not found');
  }

  await db
    .update(datasetRow)
    .set({ deletedAt: new Date() })
    .where(and(eq(datasetRow.id, rowId), eq(datasetRow.datasetId, datasetId)));
}
