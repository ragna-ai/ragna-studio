import type { Workspace } from '@repo/database';
import { getWorkspaceById } from '@repo/database';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { createMiddleware } from 'hono/factory';
import { InternalServerErrorException, NotFoundException } from '../exceptions';
import type { AuthEnv } from './authMiddleware';

export type WorkspaceGuardEnv = AuthEnv & {
  Variables: AuthEnv['Variables'] & {
    workspace: Workspace;
  };
};

/**
 * Guards every `/workspace/:workspaceId/...` route (docs/api-standards/prd.md,
 * "Access control"). Generalizes the `loadOwnedWorkspace()` helper that used
 * to live in `document.service.ts`.
 *
 * Reads the raw `:workspaceId` route param, loads the workspace, and throws
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
 * Does not validate the id's format (e.g. uuidv7); a malformed or unknown id
 * simply fails to resolve to a workspace and 404s.
 */
export const workspaceGuard = createMiddleware<WorkspaceGuardEnv>(async (c, next) => {
  const user = c.get('user');
  const workspaceId = c.req.param('workspaceId');

  if (!workspaceId) {
    throw new NotFoundException('Workspace not found');
  }

  const { error, data: workspaceRecord } = await tryCatch(() =>
    getWorkspaceById({ id: workspaceId, ownerId: user.id }),
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
