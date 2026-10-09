import type {
  Dataset,
  DatasetColumn,
  DatasetColumnType,
  DatasetRow,
  DatasetRowWriter,
} from '@repo/database';
import {
  createDatasetRow,
  findDatasetsForAgent,
  getDatasetByWorkspaceId,
  getDatasetRowById,
  getDatasetRows,
  MAX_COLUMNS_PER_DATASET,
  MAX_LIST_ROWS_LIMIT,
  moveDatasetRow,
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
import type { ToolDefinition } from './tool-definition';

// Seven tools, one family: the agent tool
// picker shows a single "Datasets" toggle that expands to all of these at
// tool-build time (see agent.tools.ts). Each is defined once, transport-
// neutral, here; getDatasetXTool below adapts it to an AI SDK tool for chat
// and workflows, and the MCP endpoint (apps/api) adapts the same definition
// for Claude Desktop.

// Every schema here is a flat top-level z.object: Anthropic's tool
// input_schema needs a top-level "type": "object", which a top-level union
// does not produce.
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

type ScopedDatasetResult = { dataset: Dataset } | { error: string };

async function loadDatasetInScope({
  datasetId,
  workspaceId,
}: {
  datasetId: string;
  workspaceId: string;
}): Promise<ScopedDatasetResult> {
  const datasetRecord = await getDatasetByWorkspaceId({ datasetId, workspaceId });

  if (!datasetRecord) {
    return { error: 'Dataset not found.' };
  }

  return { dataset: datasetRecord };
}

export interface DatasetColumnOutput {
  id: string;
  name: string;
  type: DatasetColumnType;
  options?: string[];
}

export interface DatasetOutput {
  id: string;
  name: string;
  description: string | null;
  columns: DatasetColumnOutput[];
}

export interface DatasetRowOutput {
  id: string;
  data: DatasetRow['data'];
  writtenBy: DatasetRowWriter;
  createdAt: string;
  updatedAt: string;
}

function toColumnOutput(column: DatasetColumn): DatasetColumnOutput {
  return { id: column.id, name: column.name, type: column.type, options: column.options };
}

function toDatasetOutput(datasetRecord: Dataset): DatasetOutput {
  return {
    id: datasetRecord.id,
    name: datasetRecord.name,
    description: datasetRecord.description,
    columns: datasetRecord.columns.map(toColumnOutput),
  };
}

// Row ids and timestamps are always included so the model can reason about
// recency without a separate call; writtenBy lets an agent see rows that
// came from outside it.
function toRowOutput(row: DatasetRow, projectedColumnIds?: string[]): DatasetRowOutput {
  return {
    id: row.id,
    data: projectedColumnIds ? projectRowData(row.data, projectedColumnIds) : row.data,
    writtenBy: row.writtenBy,
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

// FIFO queue per dataset so concurrent appends/moves (e.g. a multi-step plan
// in one turn) reach the database in call order; the row lock inside
// createDatasetRow/moveDatasetRow then keeps sort keys collision-free.
const datasetRowLocks = new Map<string, Promise<unknown>>();

function withDatasetRowLock<T>(datasetId: string, fn: () => Promise<T>): Promise<T> {
  const previous = datasetRowLocks.get(datasetId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  datasetRowLocks.set(datasetId, tail);
  // Drop the entry once drained, unless a later call already replaced it.
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
type DatasetCreateOutput = { dataset: DatasetOutput } | { error: string };

export const datasetCreateDefinition: ToolDefinition<
  typeof datasetCreateInputSchema,
  DatasetCreateOutput
> = {
  name: 'datasetCreate',
  description:
    'Create a new dataset: a structured table with typed columns (text, number, date, select) that both you and the user can read and edit. Use it to keep durable, structured state, e.g. a task queue or a plan.',
  inputSchema: datasetCreateInputSchema,
  access: 'write',
  async execute(input, ctx) {
    const { error, data: createdDataset } = await tryCatch(
      () =>
        createDatasetForAgent({
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          name: input.name,
          description: input.description,
          columns: input.columns,
          origin: ctx.origin,
        }),
      { retryOnFailure: false },
    );

    if (error !== null || !createdDataset) {
      return { error: toErrorMessage(error, 'Failed to create dataset.') };
    }

    return { dataset: toDatasetOutput(createdDataset) };
  },
};

export const getDatasetCreateTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetCreateInput, DatasetCreateOutput> =>
  tool({
    description: datasetCreateDefinition.description,
    inputSchema: datasetCreateDefinition.inputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-dataset', data: { action: 'create' }, transient: true });
      return datasetCreateDefinition.execute(input, { userId, workspaceId, origin: 'agent' });
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
type DatasetFindOutput = { datasets: DatasetOutput[]; note?: string } | { error: string };

export const datasetFindDefinition: ToolDefinition<
  typeof datasetFindInputSchema,
  DatasetFindOutput
> = {
  name: 'datasetFind',
  description:
    "Find datasets you or the user have created, returning each one's id and column schema so you can then call datasetListRows/datasetAppendRow/datasetUpdateRow. If a default dataset is already pinned for you, its id and schema are in your system prompt and you usually don't need this tool.",
  inputSchema: datasetFindInputSchema,
  access: 'read',
  annotations: { readOnlyHint: true },
  async execute(input, ctx) {
    const { error, data: datasets } = await tryCatch(
      () =>
        findDatasetsForAgent({
          workspaceId: ctx.workspaceId,
          query: input.query,
        }),
      { retryOnFailure: false },
    );

    if (error !== null || !datasets) {
      return { error: toErrorMessage(error, 'Failed to search datasets.') };
    }

    if (datasets.length > 0 || !input.query) {
      return { datasets: datasets.map(toDatasetOutput) };
    }

    // A missed query (typo, wrong wording) would otherwise cost a second,
    // broader call; dataset counts are small, so fall back to the full list.
    const { error: fallbackError, data: allDatasets } = await tryCatch(
      () => findDatasetsForAgent({ workspaceId: ctx.workspaceId }),
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
};

export const getDatasetFindTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetFindInput, DatasetFindOutput> =>
  tool({
    description: datasetFindDefinition.description,
    inputSchema: datasetFindDefinition.inputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-dataset', data: { action: 'find' }, transient: true });
      return datasetFindDefinition.execute(input, { userId, workspaceId, origin: 'agent' });
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
      "Column ids to include in each row's data. Omit to include all columns. Use this to skip long text columns when scanning, then read the chosen row in full with datasetGetRow.",
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
type DatasetListRowsOutput = { rows: DatasetRowOutput[] } | { error: string };

export const datasetListRowsDefinition: ToolDefinition<
  typeof datasetListRowsInputSchema,
  DatasetListRowsOutput
> = {
  name: 'datasetListRows',
  description:
    'List the (non-deleted) rows of a dataset, in dataset order (creation order unless rearranged), optionally filtered to rows where one column equals a value, optionally projected to a subset of columns. Use this to find the next item to work on.',
  inputSchema: datasetListRowsInputSchema,
  access: 'read',
  annotations: { readOnlyHint: true },
  async execute(input, ctx) {
    const scoped = await loadDatasetInScope({
      datasetId: input.datasetId,
      workspaceId: ctx.workspaceId,
    });
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

    // Default to the cap, not "unlimited", when the caller omits `limit`:
    // this tool's response goes straight into the model's context window.
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
};

export const getDatasetListRowsTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetListRowsInput, DatasetListRowsOutput> =>
  tool({
    description: datasetListRowsDefinition.description,
    inputSchema: datasetListRowsDefinition.inputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-dataset',
        data: { action: 'listRows', datasetId: input.datasetId },
        transient: true,
      });
      return datasetListRowsDefinition.execute(input, { userId, workspaceId, origin: 'agent' });
    },
  });

// datasetGetRow

const datasetGetRowInputSchema = z.object({
  datasetId: z.string(),
  rowId: z.string(),
});

type DatasetGetRowInput = z.infer<typeof datasetGetRowInputSchema>;
type DatasetGetRowOutput = { row: DatasetRowOutput } | { error: string };

export const datasetGetRowDefinition: ToolDefinition<
  typeof datasetGetRowInputSchema,
  DatasetGetRowOutput
> = {
  name: 'datasetGetRow',
  description:
    'Read a single dataset row in full by its id. Use this after a column-projected datasetListRows scan to load the complete data of the row you picked.',
  inputSchema: datasetGetRowInputSchema,
  access: 'read',
  annotations: { readOnlyHint: true },
  async execute(input, ctx) {
    const scoped = await loadDatasetInScope({
      datasetId: input.datasetId,
      workspaceId: ctx.workspaceId,
    });
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
};

export const getDatasetGetRowTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetGetRowInput, DatasetGetRowOutput> =>
  tool({
    description: datasetGetRowDefinition.description,
    inputSchema: datasetGetRowDefinition.inputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-dataset',
        data: { action: 'getRow', datasetId: input.datasetId, rowId: input.rowId },
        transient: true,
      });
      return datasetGetRowDefinition.execute(input, { userId, workspaceId, origin: 'agent' });
    },
  });

// datasetAppendRow

const datasetAppendRowInputSchema = z.object({
  datasetId: z.string(),
  data: rowDataSchema,
});

type DatasetAppendRowInput = z.infer<typeof datasetAppendRowInputSchema>;
type DatasetAppendRowOutput = { row: DatasetRowOutput } | { error: string };

export const datasetAppendRowDefinition: ToolDefinition<
  typeof datasetAppendRowInputSchema,
  DatasetAppendRowOutput
> = {
  name: 'datasetAppendRow',
  description:
    "Append a new row to a dataset. Values are validated against the dataset's column schema (unknown columns and out-of-range select values are rejected). Note: if a workflow run retries after a failure, this can duplicate a previous append; read the dataset first to check whether the row already exists.",
  inputSchema: datasetAppendRowInputSchema,
  access: 'write',
  execute(input, ctx) {
    return withDatasetRowLock(input.datasetId, async () => {
      const scoped = await loadDatasetInScope({
        datasetId: input.datasetId,
        workspaceId: ctx.workspaceId,
      });
      if ('error' in scoped) {
        return scoped;
      }

      const { error, data: row } = await tryCatch(
        () =>
          createDatasetRow({
            datasetId: input.datasetId,
            workspaceId: ctx.workspaceId,
            data: input.data,
            writtenBy: ctx.origin,
          }),
        { retryOnFailure: false },
      );

      if (error !== null || !row) {
        return { error: toErrorMessage(error, 'Failed to append dataset row.') };
      }

      return { row: toRowOutput(row) };
    });
  },
};

export const getDatasetAppendRowTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetAppendRowInput, DatasetAppendRowOutput> =>
  tool({
    description: datasetAppendRowDefinition.description,
    inputSchema: datasetAppendRowDefinition.inputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-dataset',
        data: { action: 'appendRow', datasetId: input.datasetId },
        transient: true,
      });
      return datasetAppendRowDefinition.execute(input, { userId, workspaceId, origin: 'agent' });
    },
  });

// datasetUpdateRow

const datasetUpdateRowInputSchema = z.object({
  datasetId: z.string(),
  rowId: z.string(),
  data: rowDataSchema.describe('Partial update: only the given columns change.'),
});

type DatasetUpdateRowInput = z.infer<typeof datasetUpdateRowInputSchema>;
type DatasetUpdateRowOutput = { row: DatasetRowOutput } | { error: string };

export const datasetUpdateRowDefinition: ToolDefinition<
  typeof datasetUpdateRowInputSchema,
  DatasetUpdateRowOutput
> = {
  name: 'datasetUpdateRow',
  description:
    'Partially update an existing dataset row, e.g. flipping status from "todo" to "done". Only the given columns change; the rest of the row is left as-is.',
  inputSchema: datasetUpdateRowInputSchema,
  access: 'write',
  annotations: { destructiveHint: true },
  async execute(input, ctx) {
    const scoped = await loadDatasetInScope({
      datasetId: input.datasetId,
      workspaceId: ctx.workspaceId,
    });
    if ('error' in scoped) {
      return scoped;
    }

    const { error, data: row } = await tryCatch(
      () =>
        updateDatasetRow({
          datasetId: input.datasetId,
          rowId: input.rowId,
          workspaceId: ctx.workspaceId,
          data: input.data,
          writtenBy: ctx.origin,
        }),
      { retryOnFailure: false },
    );

    if (error !== null || !row) {
      return { error: toErrorMessage(error, 'Failed to update dataset row.') };
    }

    return { row: toRowOutput(row) };
  },
};

export const getDatasetUpdateRowTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetUpdateRowInput, DatasetUpdateRowOutput> =>
  tool({
    description: datasetUpdateRowDefinition.description,
    inputSchema: datasetUpdateRowDefinition.inputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-dataset',
        data: { action: 'updateRow', datasetId: input.datasetId, rowId: input.rowId },
        transient: true,
      });
      return datasetUpdateRowDefinition.execute(input, { userId, workspaceId, origin: 'agent' });
    },
  });

// datasetMoveRow

const datasetMoveRowInputSchema = z.object({
  datasetId: z.string(),
  rowId: z.string(),
  afterRowId: z
    .string()
    .optional()
    .describe('Id of the row this one should land directly after. Omit to move it to the top.'),
});

type DatasetMoveRowInput = z.infer<typeof datasetMoveRowInputSchema>;
type DatasetMoveRowOutput = { row: DatasetRowOutput } | { error: string };

export const datasetMoveRowDefinition: ToolDefinition<
  typeof datasetMoveRowInputSchema,
  DatasetMoveRowOutput
> = {
  name: 'datasetMoveRow',
  description:
    'Reprioritize a dataset row by changing its position, e.g. "move the research step before the drafting step". Omit afterRowId to move the row to the top; otherwise it lands directly after the row with that id.',
  inputSchema: datasetMoveRowInputSchema,
  access: 'write',
  annotations: { idempotentHint: true },
  execute(input, ctx) {
    return withDatasetRowLock(input.datasetId, async () => {
      const scoped = await loadDatasetInScope({
        datasetId: input.datasetId,
        workspaceId: ctx.workspaceId,
      });
      if ('error' in scoped) {
        return scoped;
      }

      const { error, data: row } = await tryCatch(
        () =>
          moveDatasetRow({
            datasetId: input.datasetId,
            workspaceId: ctx.workspaceId,
            rowId: input.rowId,
            afterRowId: input.afterRowId,
            writtenBy: ctx.origin,
          }),
        { retryOnFailure: false },
      );

      if (error !== null || !row) {
        return { error: toErrorMessage(error, 'Failed to move dataset row.') };
      }

      return { row: toRowOutput(row) };
    });
  },
};

export const getDatasetMoveRowTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  userId: string,
  workspaceId: string,
): Tool<DatasetMoveRowInput, DatasetMoveRowOutput> =>
  tool({
    description: datasetMoveRowDefinition.description,
    inputSchema: datasetMoveRowDefinition.inputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-dataset',
        data: { action: 'moveRow', datasetId: input.datasetId, rowId: input.rowId },
        transient: true,
      });
      return datasetMoveRowDefinition.execute(input, { userId, workspaceId, origin: 'agent' });
    },
  });

export const datasetToolDefinitions: ToolDefinition<z.ZodObject, unknown>[] = [
  datasetCreateDefinition,
  datasetFindDefinition,
  datasetListRowsDefinition,
  datasetGetRowDefinition,
  datasetAppendRowDefinition,
  datasetUpdateRowDefinition,
  datasetMoveRowDefinition,
];

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

export type DatasetMoveRowToolInput = InferToolInput<ReturnType<typeof getDatasetMoveRowTool>>;
export type DatasetMoveRowToolOutput = InferToolOutput<ReturnType<typeof getDatasetMoveRowTool>>;
export type DatasetMoveRowUiTool = InferUITool<ReturnType<typeof getDatasetMoveRowTool>>;
