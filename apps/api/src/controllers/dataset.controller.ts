import {
  createDataset,
  createDatasetRow,
  deleteDatasetById,
  getAllDatasetsByUserId,
  getDatasetById,
  getDatasetCountByUserId,
  getDatasetRows,
  softDeleteDatasetRow,
  updateDataset,
  updateDatasetRow,
} from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { Hono } from 'hono';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  validCreateDatasetBody,
  validCreateDatasetRowBody,
  validDatasetIdParam,
  validDatasetRowParams,
  validUpdateDatasetBody,
  validUpdateDatasetRowBody,
  validWorkspaceScopedListQuery,
} from '../middlewares/validationMiddlewares';

export const datasetController = new Hono()
  .basePath('/dataset')
  .use(authMiddleware)
  /**
   * [GET] /dataset
   * Get all datasets for the authenticated user
   */
  .get('/', validWorkspaceScopedListQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;
    const sort = query.sort || 'desc';
    const unassigned = query.unassigned === 'true';

    // Calculate offset for pagination ((page number - 1) * page size)
    const offset = page && limit ? (page - 1) * limit : undefined;

    // Get all dataset count and fail gracefully
    const { data: datasetsCount } = await tryCatch(() =>
      getDatasetCountByUserId({ userId: user.id, workspaceId: query.workspaceId, unassigned }),
    );

    const { error, data: allUserDatasets } = await tryCatch(() =>
      getAllDatasetsByUserId({
        userId: user.id,
        workspaceId: query.workspaceId,
        unassigned,
        limit,
        sort,
        offset,
      }),
    );

    if (error !== null) {
      logger.error('Failed to get datasets for user', error);
      throw new InternalServerErrorException('Failed to get datasets for user');
    }

    const meta = {
      totalCount: datasetsCount || 0,
    };

    return c.json({ datasets: allUserDatasets, meta });
  })
  /**
   * [POST] /dataset
   * Create a new dataset
   */
  .post('/', validCreateDatasetBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');

    const { error, data: createdDataset } = await tryCatch(() =>
      createDataset({
        userId: user.id,
        workspaceId: body.workspaceId,
        name: body.name,
        description: body.description,
        columns: body.columns,
      }),
    );

    if (error !== null || !createdDataset) {
      logger.error('Failed to create dataset', error);
      throw new InternalServerErrorException('Failed to create dataset');
    }

    return c.json({ dataset: createdDataset });
  })
  /**
   * [GET] /dataset/:datasetId
   * Get a specific dataset (with its columns) by ID
   */
  .get('/:datasetId', validDatasetIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error, data: datasetRecord } = await tryCatch(() =>
      getDatasetById({ datasetId: param.datasetId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to get dataset by ID', error);
      throw new InternalServerErrorException('Failed to get dataset by ID');
    }

    if (!datasetRecord) {
      throw new NotFoundException('Dataset not found');
    }

    return c.json({ dataset: datasetRecord });
  })
  /**
   * [PATCH] /dataset/:datasetId
   * Update a dataset's name, description, and/or columns
   */
  .patch('/:datasetId', validDatasetIdParam, validUpdateDatasetBody, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const { error, data: updatedDataset } = await tryCatch(() =>
      updateDataset({
        datasetId: param.datasetId,
        userId: user.id,
        name: body.name,
        description: body.description,
        columns: body.columns,
      }),
    );

    if (error !== null) {
      logger.error('Failed to update dataset', error);
      throw new BadRequestException(error.message);
    }

    return c.json({ dataset: updatedDataset });
  })
  /**
   * [DELETE] /dataset/:datasetId
   * Delete a specific dataset (and its rows via cascade) by ID
   */
  .delete('/:datasetId', validDatasetIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error } = await tryCatch(() =>
      deleteDatasetById({ datasetId: param.datasetId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to delete dataset', error);
      throw new InternalServerErrorException('Failed to delete dataset');
    }

    return c.json({ message: 'Dataset deleted successfully' });
  })
  /**
   * [GET] /dataset/:datasetId/rows
   * Get all (non-deleted) rows of a dataset, oldest first
   */
  .get('/:datasetId/rows', validDatasetIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error: datasetError, data: datasetRecord } = await tryCatch(() =>
      getDatasetById({ datasetId: param.datasetId, userId: user.id }),
    );

    if (datasetError !== null) {
      logger.error('Failed to get dataset by ID', datasetError);
      throw new InternalServerErrorException('Failed to get dataset by ID');
    }

    if (!datasetRecord) {
      throw new NotFoundException('Dataset not found');
    }

    const { error, data: rows } = await tryCatch(() =>
      getDatasetRows({ datasetId: param.datasetId }),
    );

    if (error !== null) {
      logger.error('Failed to get dataset rows', error);
      throw new InternalServerErrorException('Failed to get dataset rows');
    }

    return c.json({ rows });
  })
  /**
   * [POST] /dataset/:datasetId/rows
   * Append a new row to a dataset
   */
  .post('/:datasetId/rows', validDatasetIdParam, validCreateDatasetRowBody, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    const { error, data: createdRow } = await tryCatch(() =>
      createDatasetRow({ datasetId: param.datasetId, userId: user.id, data: body.data }),
    );

    if (error !== null) {
      logger.error('Failed to create dataset row', error);
      throw new BadRequestException(error.message);
    }

    return c.json({ row: createdRow });
  })
  /**
   * [PATCH] /dataset/:datasetId/rows/:rowId
   * Partially update a dataset row
   */
  .patch(
    '/:datasetId/rows/:rowId',
    validDatasetRowParams,
    validUpdateDatasetRowBody,
    async (c) => {
      const user = c.get('user');
      const param = c.req.valid('param');
      const body = c.req.valid('json');

      const { error, data: updatedRow } = await tryCatch(() =>
        updateDatasetRow({
          datasetId: param.datasetId,
          rowId: param.rowId,
          userId: user.id,
          data: body.data,
        }),
      );

      if (error !== null) {
        logger.error('Failed to update dataset row', error);
        throw new BadRequestException(error.message);
      }

      return c.json({ row: updatedRow });
    },
  )
  /**
   * [DELETE] /dataset/:datasetId/rows/:rowId
   * Soft delete a dataset row
   */
  .delete('/:datasetId/rows/:rowId', validDatasetRowParams, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');

    const { error } = await tryCatch(() =>
      softDeleteDatasetRow({ datasetId: param.datasetId, rowId: param.rowId, userId: user.id }),
    );

    if (error !== null) {
      logger.error('Failed to delete dataset row', error);
      throw new InternalServerErrorException('Failed to delete dataset row');
    }

    return c.json({ message: 'Row deleted successfully' });
  });
