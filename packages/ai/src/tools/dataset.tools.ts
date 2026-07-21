import type { Dataset, DatasetColumn, DatasetRow } from '@repo/database';
import {
  createDatasetRow,
  findDatasetsForAgent,
  getDatasetById,
  getDatasetRowById,
  getDatasetRows,
  MAX_COLUMNS_PER_DATASET,
  MAX_LIST_ROWS_LIMIT,
  updateDatasetRow,
} from '@repo/database';
import { tryCatch } from '@repo/utils';
import type {
  InferToolInput,
  InferToolOutput,
  InferUITool,
  Tool,
  UIMessage,
  UIMessageStreamWriter,
} from 'ai';
import { tool } from 'ai';
import * as z from 'zod';
import { createDatasetForAgent } from '../services/dataset.service';

// Six tools, one family (docs/datasets.md decision 3/4): the agent tool
// picker shows a single "Datasets" toggle that expands to all of these at
// tool-build time (see agent.tools.ts).

// Every schema here is a flat top-level z.object: Anthropic's tool
// `input_schema` requires a top-level `type: "object"`, and a top-level
// union (e.g. z.discriminatedUnion) compiles to `anyOf` with no `type`,
// which the API rejects. Unions nested inside a property (e.g. a cell
// value) are fine.
const rowValueSchema = z.union([z.string(), z.number(), z.null()]);
const rowDataSchema = z
  .record(z.string(), rowValueSchema)
  .describe('Row data keyed by column id (not column name).');

const columnInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe('A short, stable id for this column, e.g. "status". Used as the key in row data.'),
  name: z.string().min(1).max(255).describe('Human-readable column name shown in the grid.'),
  type: z.enum(['text', 'number', 'date', 'select']),
  options: z
    .array(z.string())
    .optional()
    .describe('Allowed values. Required and only meaningful when type is "select".'),
});

// Workspace hard filter (docs/datasets.md decision 11): the whole family
// only sees/touches the tool context's workspace. userId remains the
// underlying security boundary.
function isDatasetInScope(datasetRecord: Dataset, workspaceId: string): boolean {
  return datasetRecord.workspaceId === workspaceId;
}

type ScopedDatasetResult = { dataset: Dataset } | { error: string };

async function loadDatasetInScope({
  datasetId,
  userId,
  workspaceId,
}: {
  datasetId: string;
  userId: string;
  workspaceId: string;
}): Promise<ScopedDatasetResult> {
  const datasetRecord = await getDatasetById({ datasetId, userId });

  if (!datasetRecord || !isDatasetInScope(datasetRecord, workspaceId)) {
    return { error: 'Dataset not found.' };
  }

  return { dataset: datasetRecord };
}

function toColumnOutput(column: DatasetColumn) {
  return { id: column.id, name: column.name, type: column.type, options: column.options };
}

function toDatasetOutput(datasetRecord: Dataset) {
  return {
    id: datasetRecord.id,
    name: datasetRecord.name,
    description: datasetRecord.description,
    columns: datasetRecord.columns.map(toColumnOutput),
  };
}

// Row ids and timestamps are always included so the model can reason about
// recency ("skip rows updated in the last hour") without a separate call.
function toRowOutput(row: DatasetRow, projectedColumnIds?: string[]) {
  return {
    id: row.id,
    data: projectedColumnIds ? projectRowData(row.data, projectedColumnIds) : row.data,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function projectRowData(rowData: DatasetRow['data'], columnIds: string[]): DatasetRow['data'] {
  return Object.fromEntries(columnIds.map((columnId) => [columnId, rowData[columnId] ?? null]));
}

function findUnknownColumnIds(columns: DatasetColumn[], requestedIds: string[]): string[] {
  const knownIds = new Set(columns.map((column) => column.id));
  return requestedIds.filter((requestedId) => !knownIds.has(requestedId));
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// When a model appends several rows in one turn (e.g. a multi-step plan),
// the AI SDK runs those tool calls concurrently, so their DB writes can
// land out of the order the model intended. The dataset-row lock inside
// `createDatasetRow` keeps the sort key itself correct, but only if calls
// reach it in the right order in the first place. This in-process FIFO
// queue provides that: each call's turn starts only after the previous
// one (for the same dataset) has finished, matching call/emission order.
const datasetRowLocks = new Map<string, Promise<unknown>>();

function withDatasetRowLock<T>(datasetId: string, fn: () => Promise<T>): Promise<T> {
  const previous = datasetRowLocks.get(datasetId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  datasetRowLocks.set(datasetId, tail);
  // Drop the entry once the queue drains, so the map doesn't grow with
  // every dataset ever appended to. Only if this tail is still current:
  // a call chained meanwhile has replaced it and owns the entry now.
  tail.then(() => {
    if (datasetRowLocks.get(datasetId) === tail) {
      datasetRowLocks.delete(datasetId);
    }
  });
  return next;
}

// datasetCreate

const datasetCreateInputSchema = z.object({
  name: z.string().min(1).max(255).describe('The dataset name.'),
  description: z.string().max(1000).optional(),
  columns: z
    .array(columnInputSchema)
    .max(MAX_COLUMNS_PER_DATASET)
    .describe('The dataset schema. Give each column a short, unique id.'),
});

type DatasetCreateInput = z.infer<typeof datasetCreateInputSchema>;
type DatasetCreateOutput = { dataset: ReturnType<typeof toDatasetOutput> } | { error: string };

export const getDatasetCreateTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetCreateInput, DatasetCreateOutput> =>
  tool({
    description:
      'Create a new dataset: a structured table with typed columns (text, number, date, select) that both you and the user can read and edit. Use it to keep durable, structured state, e.g. a task queue or a self-authored plan. Datasets you create are marked as agent-created in the grid.',
    inputSchema: datasetCreateInputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-dataset', data: { action: 'create' }, transient: true });

      const { error, data: createdDataset } = await tryCatch(
        () =>
          createDatasetForAgent({
            userId,
            workspaceId,
            name: input.name,
            description: input.description,
            columns: input.columns,
          }),
        { retryOnFailure: false },
      );

      if (error !== null || !createdDataset) {
        return { error: toErrorMessage(error, 'Failed to create dataset.') };
      }

      return { dataset: toDatasetOutput(createdDataset) };
    },
  });

// datasetFind

const datasetFindInputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Optional case-insensitive keyword search: every word must appear in the dataset name or description. Omit to list all.',
    ),
});

type DatasetFindInput = z.infer<typeof datasetFindInputSchema>;
type DatasetFindOutput =
  | { datasets: ReturnType<typeof toDatasetOutput>[]; note?: string }
  | { error: string };

export const getDatasetFindTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetFindInput, DatasetFindOutput> =>
  tool({
    description:
      'Find datasets you or the user have created, returning each one\'s id and column schema so you can then call datasetListRows/datasetAppendRow/datasetUpdateRow. If a default dataset is already pinned for you, its id and schema are in your system prompt and you usually don\'t need this tool.',
    inputSchema: datasetFindInputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-dataset', data: { action: 'find' }, transient: true });

      const { error, data: datasets } = await tryCatch(
        () => findDatasetsForAgent({ userId, workspaceId, query: input.query }),
        { retryOnFailure: false },
      );

      if (error !== null || !datasets) {
        return { error: toErrorMessage(error, 'Failed to search datasets.') };
      }

      if (datasets.length > 0 || !input.query) {
        return { datasets: datasets.map(toDatasetOutput) };
      }

      // A missed query (typo, wrong wording) would otherwise cost the model a
      // second, broader call. Dataset counts are small, so answer with the
      // full in-scope list right away and say why.
      const { error: fallbackError, data: allDatasets } = await tryCatch(
        () => findDatasetsForAgent({ userId, workspaceId }),
        { retryOnFailure: false },
      );

      if (fallbackError !== null || !allDatasets) {
        return { error: toErrorMessage(fallbackError, 'Failed to search datasets.') };
      }

      return {
        datasets: allDatasets.map(toDatasetOutput),
        note: `No dataset name or description matched "${input.query}"; showing all datasets instead.`,
      };
    },
  });

// datasetListRows

const datasetListRowsInputSchema = z.object({
  datasetId: z.string(),
  filter: z
    .object({ columnId: z.string(), value: rowValueSchema })
    .optional()
    .describe('Equality filter on one column, e.g. { columnId: "status", value: "todo" }.'),
  columns: z
    .array(z.string())
    .min(1)
    .optional()
    .describe(
      'Column ids to include in each row\'s data. Omit to include all columns. Use this to skip long text columns when scanning, then read the chosen row in full with datasetGetRow.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIST_ROWS_LIMIT)
    .optional()
    .describe(`Max rows to return, capped at ${MAX_LIST_ROWS_LIMIT}.`),
});

type DatasetListRowsInput = z.infer<typeof datasetListRowsInputSchema>;
type DatasetListRowsOutput = { rows: ReturnType<typeof toRowOutput>[] } | { error: string };

export const getDatasetListRowsTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetListRowsInput, DatasetListRowsOutput> =>
  tool({
    description:
      'List the (non-deleted) rows of a dataset, oldest first, optionally filtered to rows where one column equals a value, optionally projected to a subset of columns. Use this to find the next item to work on.',
    inputSchema: datasetListRowsInputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-dataset',
        data: { action: 'listRows', datasetId: input.datasetId },
        transient: true,
      });

      const scoped = await loadDatasetInScope({ datasetId: input.datasetId, userId, workspaceId });
      if ('error' in scoped) {
        return scoped;
      }

      // Same trust boundary as writes: unknown column ids are a visible tool
      // error, not silently empty fields.
      if (input.columns) {
        const unknownColumnIds = findUnknownColumnIds(scoped.dataset.columns, input.columns);
        if (unknownColumnIds.length > 0) {
          return { error: `Unknown column ids: ${unknownColumnIds.join(', ')}.` };
        }
      }

      // Default to the cap, not "unlimited", when the model omits `limit`:
      // this tool's response goes straight into the model's context window,
      // unlike the grid's own unlimited read.
      const { error, data: rows } = await tryCatch(
        () =>
          getDatasetRows({
            datasetId: input.datasetId,
            filter: input.filter,
            limit: input.limit ?? MAX_LIST_ROWS_LIMIT,
          }),
        { retryOnFailure: false },
      );

      if (error !== null || !rows) {
        return { error: toErrorMessage(error, 'Failed to list dataset rows.') };
      }

      return { rows: rows.map((row) => toRowOutput(row, input.columns)) };
    },
  });

// datasetGetRow

const datasetGetRowInputSchema = z.object({
  datasetId: z.string(),
  rowId: z.string(),
});

type DatasetGetRowInput = z.infer<typeof datasetGetRowInputSchema>;
type DatasetGetRowOutput = { row: ReturnType<typeof toRowOutput> } | { error: string };

export const getDatasetGetRowTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetGetRowInput, DatasetGetRowOutput> =>
  tool({
    description:
      'Read a single dataset row in full by its id. Use this after a column-projected datasetListRows scan to load the complete data of the row you picked.',
    inputSchema: datasetGetRowInputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-dataset',
        data: { action: 'getRow', datasetId: input.datasetId, rowId: input.rowId },
        transient: true,
      });

      const scoped = await loadDatasetInScope({ datasetId: input.datasetId, userId, workspaceId });
      if ('error' in scoped) {
        return scoped;
      }

      const { error, data: row } = await tryCatch(
        () => getDatasetRowById({ datasetId: input.datasetId, rowId: input.rowId }),
        { retryOnFailure: false },
      );

      if (error !== null) {
        return { error: toErrorMessage(error, 'Failed to read dataset row.') };
      }

      if (!row) {
        return { error: 'Row not found.' };
      }

      return { row: toRowOutput(row) };
    },
  });

// datasetAppendRow

const datasetAppendRowInputSchema = z.object({
  datasetId: z.string(),
  data: rowDataSchema,
});

type DatasetAppendRowInput = z.infer<typeof datasetAppendRowInputSchema>;
type DatasetAppendRowOutput = { row: ReturnType<typeof toRowOutput> } | { error: string };

export const getDatasetAppendRowTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetAppendRowInput, DatasetAppendRowOutput> =>
  tool({
    description:
      'Append a new row to a dataset. Values are validated against the dataset\'s column schema (unknown columns and out-of-range select values are rejected). Note: if a workflow run retries after a failure, this can duplicate a previous append; read the dataset first to check whether the row already exists.',
    inputSchema: datasetAppendRowInputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-dataset',
        data: { action: 'appendRow', datasetId: input.datasetId },
        transient: true,
      });

      return withDatasetRowLock(input.datasetId, async () => {
        const scoped = await loadDatasetInScope({ datasetId: input.datasetId, userId, workspaceId });
        if ('error' in scoped) {
          return scoped;
        }

        const { error, data: row } = await tryCatch(
          () => createDatasetRow({ datasetId: input.datasetId, userId, data: input.data }),
          { retryOnFailure: false },
        );

        if (error !== null || !row) {
          return { error: toErrorMessage(error, 'Failed to append dataset row.') };
        }

        return { row: toRowOutput(row) };
      });
    },
  });

// datasetUpdateRow

const datasetUpdateRowInputSchema = z.object({
  datasetId: z.string(),
  rowId: z.string(),
  data: rowDataSchema.describe('Partial update: only the given columns change.'),
});

type DatasetUpdateRowInput = z.infer<typeof datasetUpdateRowInputSchema>;
type DatasetUpdateRowOutput = { row: ReturnType<typeof toRowOutput> } | { error: string };

export const getDatasetUpdateRowTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetUpdateRowInput, DatasetUpdateRowOutput> =>
  tool({
    description:
      'Partially update an existing dataset row, e.g. flipping status from "todo" to "done". Only the given columns change; the rest of the row is left as-is.',
    inputSchema: datasetUpdateRowInputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-dataset',
        data: { action: 'updateRow', datasetId: input.datasetId, rowId: input.rowId },
        transient: true,
      });

      const scoped = await loadDatasetInScope({ datasetId: input.datasetId, userId, workspaceId });
      if ('error' in scoped) {
        return scoped;
      }

      const { error, data: row } = await tryCatch(
        () =>
          updateDatasetRow({
            datasetId: input.datasetId,
            rowId: input.rowId,
            userId,
            data: input.data,
          }),
        { retryOnFailure: false },
      );

      if (error !== null || !row) {
        return { error: toErrorMessage(error, 'Failed to update dataset row.') };
      }

      return { row: toRowOutput(row) };
    },
  });

export type DatasetCreateToolInput = InferToolInput<ReturnType<typeof getDatasetCreateTool>>;
export type DatasetCreateToolOutput = InferToolOutput<ReturnType<typeof getDatasetCreateTool>>;
export type DatasetCreateUiTool = InferUITool<ReturnType<typeof getDatasetCreateTool>>;

export type DatasetFindToolInput = InferToolInput<ReturnType<typeof getDatasetFindTool>>;
export type DatasetFindToolOutput = InferToolOutput<ReturnType<typeof getDatasetFindTool>>;
export type DatasetFindUiTool = InferUITool<ReturnType<typeof getDatasetFindTool>>;

export type DatasetListRowsToolInput = InferToolInput<ReturnType<typeof getDatasetListRowsTool>>;
export type DatasetListRowsToolOutput = InferToolOutput<ReturnType<typeof getDatasetListRowsTool>>;
export type DatasetListRowsUiTool = InferUITool<ReturnType<typeof getDatasetListRowsTool>>;

export type DatasetGetRowToolInput = InferToolInput<ReturnType<typeof getDatasetGetRowTool>>;
export type DatasetGetRowToolOutput = InferToolOutput<ReturnType<typeof getDatasetGetRowTool>>;
export type DatasetGetRowUiTool = InferUITool<ReturnType<typeof getDatasetGetRowTool>>;

export type DatasetAppendRowToolInput = InferToolInput<ReturnType<typeof getDatasetAppendRowTool>>;
export type DatasetAppendRowToolOutput = InferToolOutput<
  ReturnType<typeof getDatasetAppendRowTool>
>;
export type DatasetAppendRowUiTool = InferUITool<ReturnType<typeof getDatasetAppendRowTool>>;

export type DatasetUpdateRowToolInput = InferToolInput<ReturnType<typeof getDatasetUpdateRowTool>>;
export type DatasetUpdateRowToolOutput = InferToolOutput<
  ReturnType<typeof getDatasetUpdateRowTool>
>;
export type DatasetUpdateRowUiTool = InferUITool<ReturnType<typeof getDatasetUpdateRowTool>>;
