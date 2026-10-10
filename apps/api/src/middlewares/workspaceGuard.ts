import type { Workspace, WorkspaceRole } from '@repo/database';
import { getWorkspaceAccess } from '@repo/database';
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
    workspaceRole: WorkspaceRole;
  };
};

/**
 * Guards every `/workspace/:workspaceId/...` route.
 * Generalizes the `loadOwnedWorkspace()` helper that used
 * to live in `document.service.ts`.
 *
 * Reads the `:workspaceId` route param, loads the workspace, and throws
 * `NotFoundException` unless the authenticated user can open it (see `getWorkspaceAccess`). On
 * success the workspace and the user's role in it are stashed in context as
 * `c.get('workspace')` and `c.get('workspaceRole')`, so services no longer need to re-fetch them.
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

  const { error, data: access } = await tryCatch(() =>
    getWorkspaceAccess({ workspaceId: validWorkspaceId, userId: user.id }),
  );

  if (error !== null) {
    logger.error('Failed to load workspace', error);
    throw new InternalServerErrorException('Failed to load workspace');
  }

  if (!access) {
    throw new NotFoundException('Workspace not found');
  }

  c.set('workspace', access.workspace);
  c.set('workspaceRole', access.workspaceRole);
  await next();
});
