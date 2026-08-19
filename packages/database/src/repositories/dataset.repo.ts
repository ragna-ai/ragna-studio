import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import { db } from '../db';
import type { Dataset, DatasetColumn, DatasetOrigin, DatasetRow, DatasetRowData } from '../schema';
import { dataset, datasetRow } from '../schema';
import { byteOrderAsc, byteOrderDesc } from '../utils/sort-order';

export type {
  Dataset,
  DatasetColumn,
  DatasetColumnType,
  DatasetOrigin,
  DatasetRow,
  DatasetRowData,
} from '../schema';

// Size guardrails (docs/datasets.md decision 8): keep tool responses inside
// sane token budgets and the grid snappy.
export const MAX_COLUMNS_PER_DATASET = 20;
export const MAX_ROWS_PER_DATASET = 1000;
export const MAX_LIST_ROWS_LIMIT = 100;

export type DatasetWithRowCount = Dataset & { rowCount: number };

type DatasetTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  workspaceId: string;
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

// Access boundary for the agent tool family (docs/api-standards/prd.md,
// "dataset tool factory" note): a tool call is scoped by the acting user,
// not a workspace. Kept for `@repo/ai`; the REST API uses
// `getDatasetByWorkspaceId` below instead (access is workspace ownership,
// per the container model).
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

/** Access boundary for the REST API: a dataset belongs to exactly one workspace. */
export async function getDatasetByWorkspaceId({
  datasetId,
  workspaceId,
}: {
  datasetId: string;
  workspaceId: string;
}): Promise<Dataset | null> {
  const datasetRecord = await db.query.dataset.findFirst({
    where: { id: datasetId, workspaceId },
  });

  return datasetRecord ?? null;
}

export async function getDatasetCountByWorkspaceId({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<number> {
  return db.$count(dataset, eq(dataset.workspaceId, workspaceId));
}

/**
 * Paginated dataset list for one workspace. Each dataset's row count
 * (soft-deleted rows excluded) is attached with one extra count query per
 * row, acceptable at the list's page-size caps.
 */
export async function getAllDatasetsByWorkspaceId({
  workspaceId,
  limit,
  sort = 'desc',
  offset,
}: {
  workspaceId: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  offset?: number;
}): Promise<DatasetWithRowCount[]> {
  const datasets = await db.query.dataset.findMany({
    where: { workspaceId },
    limit,
    offset,
    orderBy: (t, { desc, asc }) => (sort === 'asc' ? asc(t.createdAt) : desc(t.createdAt)),
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
              OR: [{ name: { ilike: `%${term}%` } }, { description: { ilike: `%${term}%` } }],
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
  workspaceId,
  name,
  description,
  columns,
}: {
  datasetId: string;
  workspaceId: string;
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

  return db.transaction(async (tx) => {
    const [existingDataset] = await tx
      .select({ columns: dataset.columns })
      .from(dataset)
      .where(and(eq(dataset.id, datasetId), eq(dataset.workspaceId, workspaceId)))
      .for('update');

    if (!existingDataset) {
      throw new Error('Dataset not found');
    }

    const [updatedDataset] = await tx
      .update(dataset)
      .set({ name, description, columns })
      .where(and(eq(dataset.id, datasetId), eq(dataset.workspaceId, workspaceId)))
      .returning();

    if (!updatedDataset) {
      throw new Error('Dataset not found');
    }

    if (columns) {
      await pruneRemovedColumnsFromRows(tx, datasetId, existingDataset.columns, columns);
    }

    return updatedDataset;
  });
}

/**
 * Deleting a column must also drop its key from every row's jsonb blob:
 * `updateDatasetRow` merges a row's full stored data before validating, so a
 * leftover key for a removed column would fail validation the next time that
 * row is edited, even when the edit itself doesn't touch that column.
 */
async function pruneRemovedColumnsFromRows(
  tx: DatasetTransaction,
  datasetId: string,
  previousColumns: DatasetColumn[],
  currentColumns: DatasetColumn[],
): Promise<void> {
  const currentColumnIds = new Set(currentColumns.map((column) => column.id));
  const removedColumnIds = previousColumns
    .map((column) => column.id)
    .filter((columnId) => !currentColumnIds.has(columnId));

  if (removedColumnIds.length === 0) {
    return;
  }

  const prunedData = removedColumnIds.reduce(
    (rowData, columnId) => sql<DatasetRowData>`${rowData} - ${columnId}`,
    sql<DatasetRowData>`${datasetRow.data}`,
  );

  await tx.update(datasetRow).set({ data: prunedData }).where(eq(datasetRow.datasetId, datasetId));
}

export async function deleteDatasetById({
  datasetId,
  workspaceId,
}: {
  datasetId: string;
  workspaceId: string;
}): Promise<void> {
  await db
    .delete(dataset)
    .where(and(eq(dataset.id, datasetId), eq(dataset.workspaceId, workspaceId)));
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
 * Rows for one dataset, in dataset order: `sortOrder` (creation order unless
 * a row has been moved, see `moveDatasetRow`), always excluding soft-deleted
 * rows so an agent can never resurrect or double-process a removed task.
 * `filter` is an equality match on one column's value (v1 scope for the
 * `datasetListRows` tool); `limit` is capped at `MAX_LIST_ROWS_LIMIT`
 * regardless of what's requested.
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
    // `id` breaks ties: sort keys are unique for rows created under the
    // dataset lock, but backfilled rows may share one.
    orderBy: (c) => [byteOrderAsc(c.sortOrder), asc(c.id)],
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

/**
 * Locks the parent dataset row for the duration of the transaction, so
 * concurrent creates for the same dataset (e.g. an agent appending several
 * plan steps in one turn) are serialized rather than racing to read the
 * same "current last row" and compute colliding sort keys.
 */
export async function createDatasetRow({
  datasetId,
  userId,
  data,
}: {
  datasetId: string;
  userId: string;
  data: DatasetRowData;
}): Promise<DatasetRow> {
  return db.transaction(async (tx) => {
    const [lockedDataset] = await tx
      .select()
      .from(dataset)
      .where(and(eq(dataset.id, datasetId), eq(dataset.userId, userId)))
      .for('update');

    if (!lockedDataset) {
      throw new Error('Dataset not found');
    }

    const rowCount = await tx.$count(
      datasetRow,
      and(eq(datasetRow.datasetId, datasetId), isNull(datasetRow.deletedAt)),
    );
    if (rowCount >= MAX_ROWS_PER_DATASET) {
      throw new Error(`Dataset has reached the ${MAX_ROWS_PER_DATASET}-row limit`);
    }

    const validation = validateRowData(lockedDataset.columns, data);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const [lastRow] = await tx
      .select({ sortOrder: datasetRow.sortOrder })
      .from(datasetRow)
      .where(eq(datasetRow.datasetId, datasetId))
      .orderBy(byteOrderDesc(datasetRow.sortOrder))
      .limit(1);

    const sortOrder = generateKeyBetween(lastRow?.sortOrder ?? null, null);

    const [createdRow] = await tx
      .insert(datasetRow)
      .values({ datasetId, data, sortOrder })
      .returning();

    if (!createdRow) {
      throw new Error('Failed to create dataset row');
    }

    return createdRow;
  });
}

/**
 * Server-side rank computation for a row reorder
 * (docs/datasets/export-and-row-reorder.md decision 4): mirrors `moveTask` in
 * `task.repo.ts`. Locks the parent dataset row for the duration of the
 * transaction, the same lock `createDatasetRow` takes, so a move serializes
 * against concurrent appends and against other moves, and sort keys never
 * collide. `afterRowId` omitted/null means "move to top"; otherwise the row
 * lands directly after `afterRowId`. Both `rowId` and `afterRowId` must
 * reference non-deleted rows of this dataset, otherwise this throws. Moving
 * a row bumps its `updatedAt`.
 */
export async function moveDatasetRow({
  datasetId,
  userId,
  rowId,
  afterRowId,
}: {
  datasetId: string;
  userId: string;
  rowId: string;
  afterRowId?: string | null;
}): Promise<DatasetRow> {
  return db.transaction(async (tx) => {
    const [lockedDataset] = await tx
      .select()
      .from(dataset)
      .where(and(eq(dataset.id, datasetId), eq(dataset.userId, userId)))
      .for('update');

    if (!lockedDataset) {
      throw new Error('Dataset not found');
    }

    const rows = await tx
      .select({ id: datasetRow.id, sortOrder: datasetRow.sortOrder })
      .from(datasetRow)
      .where(and(eq(datasetRow.datasetId, datasetId), isNull(datasetRow.deletedAt)))
      .orderBy(byteOrderAsc(datasetRow.sortOrder), asc(datasetRow.id));

    if (!rows.some((row) => row.id === rowId)) {
      throw new Error('Dataset row not found');
    }

    // Pre-existing rows can share a `sortOrder` (e.g. backfilled data, see
    // `getDatasetRows`'s tie-break comment). `generateKeyBetween` throws on
    // equal bounds, so repair any duplicates in place before computing the
    // move: cheap since it only touches rows once, and every dataset only
    // needs it the first time it's moved.
    if (hasDuplicateSortOrder(rows)) {
      let previousSortOrder: string | null = null;
      for (const row of rows) {
        const renumberedSortOrder = generateKeyBetween(previousSortOrder, null);
        if (renumberedSortOrder !== row.sortOrder) {
          await tx
            .update(datasetRow)
            .set({ sortOrder: renumberedSortOrder })
            .where(eq(datasetRow.id, row.id));
          row.sortOrder = renumberedSortOrder;
        }
        previousSortOrder = row.sortOrder;
      }
    }

    const siblingRows = rows.filter((row) => row.id !== rowId);
    const sortOrder = resolveMoveSortOrder(siblingRows, afterRowId);

    const [movedRow] = await tx
      .update(datasetRow)
      .set({ sortOrder, updatedAt: new Date() })
      .where(and(eq(datasetRow.id, rowId), eq(datasetRow.datasetId, datasetId)))
      .returning();

    if (!movedRow) {
      throw new Error('Failed to move dataset row');
    }

    return movedRow;
  });
}

// `rows` is sorted by `sortOrder` (with `id` as tiebreaker), so a duplicate
// only ever shows up as two adjacent equal values.
function hasDuplicateSortOrder(rows: { sortOrder: string }[]): boolean {
  return rows.some((row, index) => index > 0 && row.sortOrder === rows[index - 1]?.sortOrder);
}

// `siblingRows` is already scoped to this dataset's non-deleted rows (and
// excludes the row being moved), so finding `afterRowId` in it is also the
// "belongs to this dataset and isn't deleted" validation.
function resolveMoveSortOrder(
  siblingRows: { id: string; sortOrder: string }[],
  afterRowId: string | null | undefined,
): string {
  if (!afterRowId) {
    return generateKeyBetween(null, siblingRows[0]?.sortOrder ?? null);
  }

  const afterIndex = siblingRows.findIndex((row) => row.id === afterRowId);
  if (afterIndex === -1) {
    throw new Error('afterRowId does not belong to this dataset');
  }

  const afterRow = siblingRows[afterIndex];
  const nextRow = siblingRows[afterIndex + 1];
  return generateKeyBetween(afterRow?.sortOrder ?? null, nextRow?.sortOrder ?? null);
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
