import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import { workspaceGuard } from '../middlewares/workspaceGuard';
import {
  addMemberToWorkspace,
  changeWorkspaceMemberRole,
  listMembersOfWorkspace,
  removeWorkspaceMember,
} from '../services/workspace-member.service';
import {
  validAddWorkspaceMemberBody,
  validChangeWorkspaceMemberRoleBody,
  validWorkspaceMemberParam,
} from '../validation';

export const workspaceMemberController = new Hono()
  .basePath('/workspace/:workspaceId/members')
  .use(authMiddleware)
  .use(workspaceGuard)
  /**
   * [GET] /workspace/:workspaceId/members
   * Workspace members with their user and workspace role. Anyone with access.
   */
  .get('/', async (c) => {
    const workspace = c.get('workspace');

    return c.json(await listMembersOfWorkspace({ workspace }));
  })
  /**
   * [POST] /workspace/:workspaceId/members
   * Adds an active organization member to the workspace. Workspace managers only.
   */
  .post('/', validAddWorkspaceMemberBody, async (c) => {
    const workspace = c.get('workspace');
    const callerWorkspaceRole = c.get('workspaceRole');
    const body = c.req.valid('json');

    await addMemberToWorkspace({
      workspace,
      callerWorkspaceRole,
      userId: body.userId,
      workspaceRole: body.workspaceRole,
    });

    return c.json({ success: true }, StatusCodes.CREATED);
  })
  /**
   * [PATCH] /workspace/:workspaceId/members/:userId
   * Changes a workspace member's role. Workspace managers only.
   */
  .patch('/:userId', validWorkspaceMemberParam, validChangeWorkspaceMemberRoleBody, async (c) => {
    const workspace = c.get('workspace');
    const callerWorkspaceRole = c.get('workspaceRole');
    const param = c.req.valid('param');
    const body = c.req.valid('json');

    await changeWorkspaceMemberRole({
      workspace,
      callerWorkspaceRole,
      userId: param.userId,
      workspaceRole: body.workspaceRole,
    });

    return c.json({ success: true });
  })
  /**
   * [DELETE] /workspace/:workspaceId/members/:userId
   * Removes a workspace member. Workspace managers, or the member themselves (leave).
   */
  .delete('/:userId', validWorkspaceMemberParam, async (c) => {
    const user = c.get('user');
    const workspace = c.get('workspace');
    const callerWorkspaceRole = c.get('workspaceRole');
    const param = c.req.valid('param');

    await removeWorkspaceMember({
      workspace,
      callerWorkspaceRole,
      callerUserId: user.id,
      userId: param.userId,
    });

    return c.json({ success: true });
  });
