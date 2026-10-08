import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  createDatasetForUser,
  createDatasetRowForUser,
  deleteDataset,
  deleteDatasetRow,
  exportDataset,
  getDataset,
  listDatasetRows,
  listDatasets,
  moveDatasetRowForUser,
  updateDatasetForUser,
  updateDatasetRowForUser,
} from '../services/dataset.service';
import { buildAttachmentContentDisposition } from '../utils/content-disposition';
import {
  validCreateDatasetBody,
  validCreateDatasetRowBody,
  validDatasetExportQuery,
  validDatasetIdParam,
  validDatasetRowIdParam,
  validMoveDatasetRowBody,
  validPaginationQuery,
  validUpdateDatasetBody,
  validUpdateDatasetRowBody,
} from '../validation';

export const datasetController = new Hono()
  .basePath('/workspace/:workspaceId/dataset')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/dataset
   * Paginated list of the workspace's datasets, newest first by default.
   */
  .get('/', validPaginationQuery, async (c) => {
    const workspace = c.get('workspace');
    const query = c.req.valid('query');

    const { datasets, meta } = await listDatasets({
      workspaceId: workspace.id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });

    return c.json({ datasets, meta });
  })
  /**
   * [POST] /workspace/:workspaceId/dataset
   * Create a dataset in this workspace.
   */
  .post('/', validCreateDatasetBody, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const body = c.req.valid('json');

    const createdDataset = await createDatasetForUser({
      workspaceId: workspace.id,
      userId: user.id,
      name: body.name,
      description: body.description,
      columns: body.columns,
    });

    return c.json({ dataset: createdDataset }, StatusCodes.CREATED);
  })
  /**
   * [GET] /workspace/:workspaceId/dataset/:datasetId
   * Get a specific dataset (with its columns) by ID.
   */
  .get('/:datasetId', validDatasetIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const datasetRecord = await getDataset({
      workspaceId: workspace.id,
      datasetId: param.datasetId,
    });

    return c.json({ dataset: datasetRecord });
  })
  /**
   * [PATCH] /workspace/:workspaceId/dataset/:datasetId
   * Update a dataset's name, description, and/or columns.
   */
  .patch('/:datasetId', validDatasetIdParam, validUpdateDatasetBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedDataset = await updateDatasetForUser({
      workspaceId: workspace.id,
      datasetId: param.datasetId,
      name: body.name,
      description: body.description,
      columns: body.columns,
    });

    return c.json({ dataset: updatedDataset });
  })
  /**
   * [DELETE] /workspace/:workspaceId/dataset/:datasetId
   * Delete a specific dataset (and its rows via cascade) by ID.
   */
  .delete('/:datasetId', validDatasetIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteDataset({ workspaceId: workspace.id, datasetId: param.datasetId });

    return c.json({ message: 'Dataset deleted successfully' });
  })
  /**
   * [GET] /workspace/:workspaceId/dataset/:datasetId/export
   * Downloads the dataset as CSV, Excel (xlsx), PDF, or Markdown.
   */
  .get('/:datasetId/export', validDatasetIdParam, validDatasetExportQuery, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const query = c.req.valid('query');

    const file = await exportDataset({
      workspaceId: workspace.id,
      datasetId: param.datasetId,
      format: query.format,
    });

    return c.body(new Uint8Array(file.bytes), 200, {
      'Content-Type': file.contentType,
      'Content-Disposition': buildAttachmentContentDisposition(file.filename),
    });
  })
  /**
   * [GET] /workspace/:workspaceId/dataset/:datasetId/row
   * Get all (non-deleted) rows of a dataset, oldest first. Unpaginated:
   * rows within one dataset are bounded by MAX_ROWS_PER_DATASET.
   */
  .get('/:datasetId/row', validDatasetIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    const rows = await listDatasetRows({
      workspaceId: workspace.id,
      datasetId: param.datasetId,
    });

    return c.json({ rows });
  })
  /**
   * [POST] /workspace/:workspaceId/dataset/:datasetId/row
   * Append a new row to a dataset.
   */
  .post('/:datasetId/row', validDatasetIdParam, validCreateDatasetRowBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const createdRow = await createDatasetRowForUser({
      workspaceId: workspace.id,
      datasetId: param.datasetId,
      data: body.data,
    });

    return c.json({ row: createdRow }, StatusCodes.CREATED);
  })
  /**
   * [PATCH] /workspace/:workspaceId/dataset/:datasetId/row/:rowId
   * Partially update a dataset row.
   */
  .patch('/:datasetId/row/:rowId', validDatasetRowIdParam, validUpdateDatasetRowBody, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const updatedRow = await updateDatasetRowForUser({
      workspaceId: workspace.id,
      datasetId: param.datasetId,
      rowId: param.rowId,
      data: body.data,
    });

    return c.json({ row: updatedRow });
  })
  /**
   * [DELETE] /workspace/:workspaceId/dataset/:datasetId/row/:rowId
   * Soft delete a dataset row.
   */
  .delete('/:datasetId/row/:rowId', validDatasetRowIdParam, async (c) => {
    const workspace = c.get('workspace');
    const param = c.req.valid('param');

    await deleteDatasetRow({
      workspaceId: workspace.id,
      datasetId: param.datasetId,
      rowId: param.rowId,
    });

    return c.json({ message: 'Row deleted successfully' });
  })
  /**
   * [POST] /workspace/:workspaceId/dataset/:datasetId/row/:rowId/move
   * One atomic call per reorder: server computes the new sortOrder from the
   * dataset's row order. Omitted afterRowId means top of the dataset.
   */
  .post(
    '/:datasetId/row/:rowId/move',
    validDatasetRowIdParam,
    validMoveDatasetRowBody,
    async (c) => {
      const workspace = c.get('workspace');
      const param = c.req.valid('param');
      const body = c.req.valid('json');

      const row = await moveDatasetRowForUser({
        workspaceId: workspace.id,
        datasetId: param.datasetId,
        rowId: param.rowId,
        afterRowId: body.afterRowId,
      });

      return c.json({ row });
    },
  );
