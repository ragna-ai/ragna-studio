import { index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { primaryIdColumn, timestamps } from './common.schema';
import { user } from './user.schema';
import { workspace } from './workspace.schema';

export type DatasetColumnType = 'text' | 'number' | 'date' | 'select';

export interface DatasetColumn {
  id: string;
  name: string;
  type: DatasetColumnType;
  // Only meaningful for `type: 'select'`. Values a row's data may hold for
  // this column.
  options?: string[];
}

// 'user' = created via the grid, 'agent' = created by a tool call
// (datasetCreate). Purely a UI badge; ownership/access is unaffected.
export type DatasetOrigin = 'user' | 'agent';

// Keyed by column id (not name), so renaming a column never breaks data
// already stored in a row.
export type DatasetRowData = Record<string, string | number | null>;

const emptyColumns: DatasetColumn[] = [];

// DATASET
export const dataset = pgTable(
  'datasets',
  {
    id: primaryIdColumn,
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    origin: text('origin').notNull().$type<DatasetOrigin>().default('user'),
    columns: jsonb('columns').notNull().$type<DatasetColumn[]>().default(emptyColumns),
    ...timestamps,
  },
  (table) => [
    index('dataset_userId_idx').on(table.userId),
    index('dataset_workspaceId_idx').on(table.workspaceId),
  ],
);

export type Dataset = typeof dataset.$inferSelect;
export type NewDataset = typeof dataset.$inferInsert;

// DATASET ROW
export const datasetRow = pgTable(
  'dataset_rows',
  {
    id: primaryIdColumn,
    datasetId: text('dataset_id')
      .notNull()
      .references(() => dataset.id, { onDelete: 'cascade' }),
    // Row-level semantics, not just bookkeeping: createdAt/updatedAt answer
    // "when was this task added / last touched"; a soft delete via
    // deletedAt means a removed row can never be resurrected or
    // double-processed by an agent (see dataset.repo.ts read paths).
    data: jsonb('data').notNull().$type<DatasetRowData>().default({}),
    ...timestamps,
  },
  (table) => [index('datasetRow_datasetId_idx').on(table.datasetId)],
);

export type DatasetRow = typeof datasetRow.$inferSelect;
export type NewDatasetRow = typeof datasetRow.$inferInsert;
