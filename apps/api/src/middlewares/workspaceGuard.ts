import type { Workspace } from '@repo/database';
import { getWorkspaceById } from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { createMiddleware } from 'hono/factory';
import * as z from 'zod';
import { InternalServerErrorException, NotFoundException } from '../exceptions';
import type { AuthEnv } from './authMiddleware';

const workspaceIdSchema = z.uuidv7();

export type WorkspaceGuardEnv = AuthEnv & {
  Variables: AuthEnv['Variables'] & {
    workspace: Workspace;
  };
};

/**
 * Guards every `/workspace/:workspaceId/...` route.
 * Generalizes the `loadOwnedWorkspace()` helper that used
 * to live in `document.service.ts`.
 *
 * Reads the `:workspaceId` route param, loads the workspace, and throws
 * `NotFoundException` unless it belongs to the authenticated user. On
 * success the workspace is stashed in context as `c.get('workspace')` for
 * every downstream handler, so services no longer need to re-fetch it.
 *
 * Usage: mount after `authMiddleware` on any controller whose base path
 * contains `:workspaceId`, e.g.
 *
 * ```ts
 * export const agentController = new Hono()
 *   .basePath('/workspace/:workspaceId/agent')
 *   .use(authMiddleware)
 *   .use(workspaceGuard)
 *   .get('/', async (c) => {
 *     const workspace = c.get('workspace');
 *     // ...
 *   });
 * ```
 *
 * Validates the id is a uuidv7 before querying; a malformed or unknown id
 * both 404 as "Workspace not found".
 */
export const workspaceGuard = createMiddleware<WorkspaceGuardEnv>(async (c, next) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');

  const { success: validationSuccess, data: validWorkspaceId } =
    workspaceIdSchema.safeParse(workspaceId);

  if (!validationSuccess) {
    throw new NotFoundException('Workspace not found');
  }

  const { error, data: workspaceRecord } = await tryCatch(() =>
    getWorkspaceById({ id: validWorkspaceId, ownerId: user.id }),
  );

  if (error !== null) {
    logger.error('Failed to load workspace', error);
    throw new InternalServerErrorException('Failed to load workspace');
  }

  if (!workspaceRecord) {
    throw new NotFoundException('Workspace not found');
  }

  c.set('workspace', workspaceRecord);
  await next();
});
