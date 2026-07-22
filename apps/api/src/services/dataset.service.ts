import type { Dataset, DatasetColumn, DatasetRow, DatasetWithRowCount } from '@repo/database';
import {
  createDataset,
  createDatasetRow,
  deleteDatasetById,
  getAllDatasetsByWorkspaceId,
  getDatasetByWorkspaceId,
  getDatasetCountByWorkspaceId,
  getDatasetRowById,
  getDatasetRows,
  moveDatasetRow,
  softDeleteDatasetRow,
  updateDataset,
  updateDatasetRow,
} from '@repo/database';
import type { TabularExport } from '@repo/export';
import { toCsv, toMarkdown, toPdf, toXlsx } from '@repo/export';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '../exceptions';

export interface DatasetListMeta {
  totalCount: number;
}

/**
 * Loads a dataset, scoped to the workspace it must belong to. This is the
 * access check for every dataset endpoint below: the workspace guard already
 * confirmed the caller owns `workspaceId`, so finding the dataset by
 * `(datasetId, workspaceId)` is sufficient. Throws 404 if it doesn't exist in
 * that workspace.
 */
async function loadOwnedDataset({
  workspaceId,
  datasetId,
}: {
  workspaceId: string;
  datasetId: string;
}): Promise<Dataset> {
  const { error, data: datasetRecord } = await tryCatch(() =>
    getDatasetByWorkspaceId({ datasetId, workspaceId }),
  );

  if (error !== null) {
    logger.error('Failed to load dataset', error);
    throw new InternalServerErrorException('Failed to load dataset');
  }

  if (!datasetRecord) {
    throw new NotFoundException('Dataset not found');
  }

  return datasetRecord;
}

/**
 * [GET] /workspace/:workspaceId/dataset
 * Paginated list of a workspace's datasets, newest first by default.
 */
export async function listDatasets({
  workspaceId,
  page = 1,
  limit = 10,
  sort = 'desc',
}: {
  workspaceId: string;
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}): Promise<{ datasets: DatasetWithRowCount[]; meta: DatasetListMeta }> {
  const offset = (page - 1) * limit;

  const { error: countError, data: totalCount } = await tryCatch(() =>
    getDatasetCountByWorkspaceId({ workspaceId }),
  );

  if (countError !== null || totalCount === null) {
    logger.error('Failed to count datasets', countError);
    throw new InternalServerErrorException('Failed to count datasets');
  }

  const { error, data: datasets } = await tryCatch(() =>
    getAllDatasetsByWorkspaceId({ workspaceId, limit, sort, offset }),
  );

  if (error !== null || !datasets) {
    logger.error('Failed to list datasets', error);
    throw new InternalServerErrorException('Failed to list datasets');
  }

  return { datasets, meta: { totalCount } };
}

/**
 * [POST] /workspace/:workspaceId/dataset
 */
export async function createDatasetForUser({
  workspaceId,
  userId,
  name,
  description,
  columns,
}: {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string;
  columns?: DatasetColumn[];
}): Promise<Dataset> {
  const { error, data: createdDataset } = await tryCatch(() =>
    createDataset({ userId, workspaceId, name, description, columns }),
  );

  if (error !== null || !createdDataset) {
    logger.error('Failed to create dataset', error);
    throw new BadRequestException(error?.message ?? 'Failed to create dataset');
  }

  return createdDataset;
}

/**
 * [GET] /workspace/:workspaceId/dataset/:datasetId
 */
export async function getDataset({
  workspaceId,
  datasetId,
}: {
  workspaceId: string;
  datasetId: string;
}): Promise<Dataset> {
  return loadOwnedDataset({ workspaceId, datasetId });
}

// EXPORT (docs/datasets/export-and-row-reorder.md)

export type DatasetExportFormat = 'csv' | 'xlsx' | 'pdf' | 'md';

export interface DatasetExportFile {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}

const DATASET_EXPORT_WRITERS: Record<
  DatasetExportFormat,
  (input: TabularExport) => Promise<{ bytes: Uint8Array; contentType: string }>
> = {
  csv: toCsv,
  xlsx: toXlsx,
  pdf: toPdf,
  md: toMarkdown,
};

const DATASET_EXPORT_FILE_EXTENSION: Record<DatasetExportFormat, string> = {
  csv: 'csv',
  xlsx: 'xlsx',
  pdf: 'pdf',
  md: 'md',
};

// Excel/filesystem-safe: lowercase, ASCII, hyphen-separated, no leading or
// trailing hyphens. Falls back to a generic name if a dataset's name
// sanitizes down to nothing (e.g. it's entirely emoji or punctuation).
function slugifyDatasetName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics left behind by NFKD
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : 'dataset';
}

// `<dataset-name-slug>-<yyyy-mm-dd>.<ext>` (docs/datasets/export-and-row-reorder.md
// "User experience", Export).
function toDatasetExportFilename(datasetName: string, format: DatasetExportFormat): string {
  const exportDate = new Date().toISOString().slice(0, 10);
  return `${slugifyDatasetName(datasetName)}-${exportDate}.${DATASET_EXPORT_FILE_EXTENSION[format]}`;
}

/**
 * Maps a dataset and its rows to the format-agnostic `TabularExport` input
 * (docs/datasets/export-and-row-reorder.md decision 1): the package knows
 * formats, not datasets. Headers are column names, cell values are resolved
 * by column id (not name, matching the row's own storage key), rows follow
 * grid order (`getDatasetRows` already orders by `sortOrder` and excludes
 * soft-deleted rows), and there's no `createdAt`/`updatedAt`.
 */
function toTabularExport(datasetRecord: Dataset, rows: DatasetRow[]): TabularExport {
  return {
    title: datasetRecord.name,
    columns: datasetRecord.columns.map((column) => ({ name: column.name, type: column.type })),
    rows: rows.map((row) => datasetRecord.columns.map((column) => row.data[column.id] ?? null)),
  };
}

/**
 * [GET] /workspace/:workspaceId/dataset/:datasetId/export
 * Generation is synchronous in the request (docs/datasets/export-and-row-reorder.md
 * decision 2): datasets are bounded by MAX_ROWS_PER_DATASET/
 * MAX_COLUMNS_PER_DATASET, well inside a request budget. An empty dataset
 * still produces a file (open question 2): the writers handle a header-only
 * CSV/xlsx and a "no rows" note in the PDF.
 */
export async function exportDataset({
  workspaceId,
  datasetId,
  format,
}: {
  workspaceId: string;
  datasetId: string;
  format: DatasetExportFormat;
}): Promise<DatasetExportFile> {
  const datasetRecord = await loadOwnedDataset({ workspaceId, datasetId });

  const { error, data: rows } = await tryCatch(() => getDatasetRows({ datasetId }));

  if (error !== null || !rows) {
    logger.error('Failed to load dataset rows for export', error);
    throw new InternalServerErrorException('Failed to load dataset rows');
  }

  const { bytes, contentType } = await DATASET_EXPORT_WRITERS[format](
    toTabularExport(datasetRecord, rows),
  );

  return { bytes, contentType, filename: toDatasetExportFilename(datasetRecord.name, format) };
}

/**
 * [PATCH] /workspace/:workspaceId/dataset/:datasetId
 */
export async function updateDatasetForUser({
  workspaceId,
  datasetId,
  name,
  description,
  columns,
}: {
  workspaceId: string;
  datasetId: string;
  name?: string;
  description?: string | null;
  columns?: DatasetColumn[];
}): Promise<Dataset> {
  await loadOwnedDataset({ workspaceId, datasetId });

  const { error, data: updatedDataset } = await tryCatch(() =>
    updateDataset({ datasetId, workspaceId, name, description, columns }),
  );

  if (error !== null || !updatedDataset) {
    logger.error('Failed to update dataset', error);
    throw new BadRequestException(error?.message ?? 'Failed to update dataset');
  }

  return updatedDataset;
}

/**
 * [DELETE] /workspace/:workspaceId/dataset/:datasetId
 * Deletes the dataset and its rows (cascade).
 */
export async function deleteDataset({
  workspaceId,
  datasetId,
}: {
  workspaceId: string;
  datasetId: string;
}): Promise<void> {
  await loadOwnedDataset({ workspaceId, datasetId });

  const { error } = await tryCatch(() => deleteDatasetById({ datasetId, workspaceId }));

  if (error !== null) {
    logger.error('Failed to delete dataset', error);
    throw new InternalServerErrorException('Failed to delete dataset');
  }
}

/**
 * [GET] /workspace/:workspaceId/dataset/:datasetId/row
 * All (non-deleted) rows of a dataset, oldest first. Rows are naturally
 * bounded per dataset (MAX_ROWS_PER_DATASET, see @repo/database), so this is
 * unpaginated.
 */
export async function listDatasetRows({
  workspaceId,
  datasetId,
}: {
  workspaceId: string;
  datasetId: string;
}): Promise<DatasetRow[]> {
  await loadOwnedDataset({ workspaceId, datasetId });

  const { error, data: rows } = await tryCatch(() => getDatasetRows({ datasetId }));

  if (error !== null || !rows) {
    logger.error('Failed to list dataset rows', error);
    throw new InternalServerErrorException('Failed to list dataset rows');
  }

  return rows;
}

/**
 * [POST] /workspace/:workspaceId/dataset/:datasetId/row
 * `createDatasetRow` is shared with the agent tool family in `@repo/ai`,
 * which re-checks ownership by (datasetId, userId). Workspace membership was
 * already verified above, so the dataset's own authorship id is passed
 * through here rather than the acting request user's id.
 */
export async function createDatasetRowForUser({
  workspaceId,
  datasetId,
  data,
}: {
  workspaceId: string;
  datasetId: string;
  data: DatasetRow['data'];
}): Promise<DatasetRow> {
  const datasetRecord = await loadOwnedDataset({ workspaceId, datasetId });

  const { error, data: createdRow } = await tryCatch(() =>
    createDatasetRow({ datasetId, userId: datasetRecord.userId, data }),
  );

  if (error !== null || !createdRow) {
    logger.error('Failed to create dataset row', error);
    throw new BadRequestException(error?.message ?? 'Failed to create dataset row');
  }

  return createdRow;
}

/**
 * [PATCH] /workspace/:workspaceId/dataset/:datasetId/row/:rowId
 */
export async function updateDatasetRowForUser({
  workspaceId,
  datasetId,
  rowId,
  data,
}: {
  workspaceId: string;
  datasetId: string;
  rowId: string;
  data: DatasetRow['data'];
}): Promise<DatasetRow> {
  const datasetRecord = await loadOwnedDataset({ workspaceId, datasetId });

  const { error: rowError, data: existingRow } = await tryCatch(() =>
    getDatasetRowById({ datasetId, rowId }),
  );

  if (rowError !== null) {
    logger.error('Failed to load dataset row', rowError);
    throw new InternalServerErrorException('Failed to load dataset row');
  }

  if (!existingRow) {
    throw new NotFoundException('Dataset row not found');
  }

  const { error, data: updatedRow } = await tryCatch(() =>
    updateDatasetRow({ datasetId, rowId, userId: datasetRecord.userId, data }),
  );

  if (error !== null || !updatedRow) {
    logger.error('Failed to update dataset row', error);
    throw new BadRequestException(error?.message ?? 'Failed to update dataset row');
  }

  return updatedRow;
}

/**
 * [DELETE] /workspace/:workspaceId/dataset/:datasetId/row/:rowId
 * Soft delete: the row is hidden from all reads but not physically removed.
 */
export async function deleteDatasetRow({
  workspaceId,
  datasetId,
  rowId,
}: {
  workspaceId: string;
  datasetId: string;
  rowId: string;
}): Promise<void> {
  const datasetRecord = await loadOwnedDataset({ workspaceId, datasetId });

  const { error: rowError, data: existingRow } = await tryCatch(() =>
    getDatasetRowById({ datasetId, rowId }),
  );

  if (rowError !== null) {
    logger.error('Failed to load dataset row', rowError);
    throw new InternalServerErrorException('Failed to load dataset row');
  }

  if (!existingRow) {
    throw new NotFoundException('Dataset row not found');
  }

  const { error } = await tryCatch(() =>
    softDeleteDatasetRow({ datasetId, rowId, userId: datasetRecord.userId }),
  );

  if (error !== null) {
    logger.error('Failed to delete dataset row', error);
    throw new InternalServerErrorException('Failed to delete dataset row');
  }
}

// The repo throws a plain Error (no typed error class) for these two cases;
// matched by message since that's the only signal it gives us
// (docs/datasets/export-and-row-reorder.md decision 4, mirroring
// isInvalidAfterTaskIdError in task.service.ts).
function isRowNotFoundError(error: Error): boolean {
  return error.message === 'Dataset row not found';
}

function isInvalidAfterRowIdError(error: Error): boolean {
  return error.message.includes('afterRowId does not belong to this dataset');
}

/**
 * [POST] /workspace/:workspaceId/dataset/:datasetId/row/:rowId/move
 * Server computes the new sortOrder from the dataset's row order
 * (docs/datasets/export-and-row-reorder.md decision 5).
 */
export async function moveDatasetRowForUser({
  workspaceId,
  datasetId,
  rowId,
  afterRowId,
}: {
  workspaceId: string;
  datasetId: string;
  rowId: string;
  afterRowId?: string | null;
}): Promise<DatasetRow> {
  const datasetRecord = await loadOwnedDataset({ workspaceId, datasetId });

  const { error, data: movedRow } = await tryCatch(() =>
    moveDatasetRow({ datasetId, userId: datasetRecord.userId, rowId, afterRowId }),
  );

  if (error !== null) {
    if (isRowNotFoundError(error)) {
      throw new NotFoundException('Dataset row not found');
    }
    if (isInvalidAfterRowIdError(error)) {
      throw new BadRequestException('afterRowId does not belong to this dataset');
    }

    logger.error('Failed to move dataset row', error);
    throw new InternalServerErrorException('Failed to move dataset row');
  }

  if (!movedRow) {
    throw new NotFoundException('Dataset row not found');
  }

  return movedRow;
}
