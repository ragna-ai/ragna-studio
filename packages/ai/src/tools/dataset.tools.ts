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
  getDatasetRowCount,
  getDatasetRows,
  MAX_COLUMNS_PER_DATASET,
  MAX_LIST_ROWS_LIMIT,
  MAX_ROWS_PER_DATASET,
  moveDatasetRow,
  updateDatasetRow,
  validateColumns,
  validateRowData,
} from '@repo/database';
import * as z from 'zod';
import { createDatasetForAgent } from '../services/dataset.service';
import type { ToolDefinition, ToolFailure } from './tool-definition';

// Seven tools, one family: the agent tool picker shows a single "Datasets"
// toggle that expands to all of these (see agent.tools.ts).

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

type DatasetToolFailure = ToolFailure<'not_found' | 'invalid_input' | 'limit_reached'>;
type ScopedDatasetResult = { dataset: Dataset } | ToolFailure<'not_found'>;

function rowNotFound(): ToolFailure<'not_found'> {
  return { status: 'not_found', message: 'Row not found.' };
}

function invalidInput(message: string): ToolFailure<'invalid_input'> {
  return { status: 'invalid_input', message };
}

async function loadDatasetInScope({
  datasetId,
  workspaceId,
}: {
  datasetId: string;
  workspaceId: string;
}): Promise<ScopedDatasetResult> {
  const datasetRecord = await getDatasetByWorkspaceId({ datasetId, workspaceId });

  if (!datasetRecord) {
    return { status: 'not_found', message: 'Dataset not found.' };
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

type DatasetCreateOutput = { dataset: DatasetOutput } | ToolFailure<'invalid_input'>;

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
    const columnsValidation = validateColumns(input.columns);
    if (!columnsValidation.valid) {
      return invalidInput(columnsValidation.error);
    }

    const createdDataset = await createDatasetForAgent({
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      name: input.name,
      description: input.description,
      columns: input.columns,
      origin: ctx.origin,
    });

    return { dataset: toDatasetOutput(createdDataset) };
  },
};

// datasetFind

const datasetFindInputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Optional case-insensitive keyword search: every word must appear in the dataset name or description. Omit to list all.',
    ),
});

type DatasetFindOutput = { datasets: DatasetOutput[]; note?: string };

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
    const datasets = await findDatasetsForAgent({
      workspaceId: ctx.workspaceId,
      query: input.query,
    });

    if (datasets.length > 0 || !input.query) {
      return { datasets: datasets.map(toDatasetOutput) };
    }

    // A missed query (typo, wrong wording) would otherwise cost a second,
    // broader call; dataset counts are small, so fall back to the full list.
    const allDatasets = await findDatasetsForAgent({ workspaceId: ctx.workspaceId });

    return {
      datasets: allDatasets.map(toDatasetOutput),
      note: `No dataset name or description matched "${input.query}"; showing all datasets instead.`,
    };
  },
};

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

type DatasetListRowsOutput =
  | { rows: DatasetRowOutput[] }
  | ToolFailure<'not_found' | 'invalid_input'>;

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
    if ('status' in scoped) {
      return scoped;
    }

    // Same trust boundary as writes: unknown column ids are a visible tool
    // error, not silently empty fields.
    if (input.columns) {
      const unknownColumnIds = findUnknownColumnIds(scoped.dataset.columns, input.columns);
      if (unknownColumnIds.length > 0) {
        return invalidInput(`Unknown column ids: ${unknownColumnIds.join(', ')}.`);
      }
    }

    // Default to the cap, not "unlimited", when the caller omits `limit`:
    // this tool's response goes straight into the model's context window.
    const rows = await getDatasetRows({
      datasetId: input.datasetId,
      filter: input.filter,
      limit: input.limit ?? MAX_LIST_ROWS_LIMIT,
    });

    return { rows: rows.map((row) => toRowOutput(row, input.columns)) };
  },
};

// datasetGetRow

const datasetGetRowInputSchema = z.object({
  datasetId: z.string(),
  rowId: z.string(),
});

type DatasetGetRowOutput = { row: DatasetRowOutput } | ToolFailure<'not_found'>;

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
    if ('status' in scoped) {
      return scoped;
    }

    const row = await getDatasetRowById({ datasetId: input.datasetId, rowId: input.rowId });
    if (!row) {
      return rowNotFound();
    }

    return { row: toRowOutput(row) };
  },
};

// datasetAppendRow

const datasetAppendRowInputSchema = z.object({
  datasetId: z.string(),
  data: rowDataSchema,
});

type DatasetAppendRowOutput = { row: DatasetRowOutput } | DatasetToolFailure;

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
      if ('status' in scoped) {
        return scoped;
      }

      const rowCount = await getDatasetRowCount({ datasetId: input.datasetId });
      if (rowCount >= MAX_ROWS_PER_DATASET) {
        return {
          status: 'limit_reached',
          message: `Dataset has reached the ${MAX_ROWS_PER_DATASET}-row limit.`,
        };
      }

      const validation = validateRowData(scoped.dataset.columns, input.data);
      if (!validation.valid) {
        return invalidInput(validation.error);
      }

      const row = await createDatasetRow({
        datasetId: input.datasetId,
        workspaceId: ctx.workspaceId,
        data: input.data,
        writtenBy: ctx.origin,
      });

      return { row: toRowOutput(row) };
    });
  },
};

// datasetUpdateRow

const datasetUpdateRowInputSchema = z.object({
  datasetId: z.string(),
  rowId: z.string(),
  data: rowDataSchema.describe('Partial update: only the given columns change.'),
});

type DatasetUpdateRowOutput = { row: DatasetRowOutput } | DatasetToolFailure;

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
    if ('status' in scoped) {
      return scoped;
    }

    const existingRow = await getDatasetRowById({
      datasetId: input.datasetId,
      rowId: input.rowId,
    });
    if (!existingRow) {
      return rowNotFound();
    }

    const validation = validateRowData(scoped.dataset.columns, {
      ...existingRow.data,
      ...input.data,
    });
    if (!validation.valid) {
      return invalidInput(validation.error);
    }

    const row = await updateDatasetRow({
      datasetId: input.datasetId,
      rowId: input.rowId,
      workspaceId: ctx.workspaceId,
      data: input.data,
      writtenBy: ctx.origin,
    });

    return { row: toRowOutput(row) };
  },
};

// datasetMoveRow

const datasetMoveRowInputSchema = z.object({
  datasetId: z.string(),
  rowId: z.string(),
  afterRowId: z
    .string()
    .optional()
    .describe('Id of the row this one should land directly after. Omit to move it to the top.'),
});

type DatasetMoveRowOutput = { row: DatasetRowOutput } | DatasetToolFailure;

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
      if ('status' in scoped) {
        return scoped;
      }

      const existingRow = await getDatasetRowById({
        datasetId: input.datasetId,
        rowId: input.rowId,
      });
      if (!existingRow) {
        return rowNotFound();
      }

      if (input.afterRowId !== undefined) {
        if (input.afterRowId === input.rowId) {
          return invalidInput('A row cannot be moved after itself.');
        }
        const anchorRow = await getDatasetRowById({
          datasetId: input.datasetId,
          rowId: input.afterRowId,
        });
        if (!anchorRow) {
          return { status: 'not_found', message: 'The afterRowId row was not found.' };
        }
      }

      const row = await moveDatasetRow({
        datasetId: input.datasetId,
        workspaceId: ctx.workspaceId,
        rowId: input.rowId,
        afterRowId: input.afterRowId,
        writtenBy: ctx.origin,
      });

      return { row: toRowOutput(row) };
    });
  },
};

export const datasetToolDefinitions: ToolDefinition<z.ZodObject, unknown>[] = [
  datasetCreateDefinition,
  datasetFindDefinition,
  datasetListRowsDefinition,
  datasetGetRowDefinition,
  datasetAppendRowDefinition,
  datasetUpdateRowDefinition,
  datasetMoveRowDefinition,
];
