import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  getOrganizationForUser,
  getUsageByMemberForUser,
  leaveOrganization,
  removeMemberForUser,
  restoreMemberForUser,
  transferOwnershipForUser,
} from '../services/organization.service';
import { validMemberIdParam, validTransferOwnershipBody } from '../validation';

// The caller's organization is their single membership, so no workspaceGuard.
export const organizationController = new Hono()
  .basePath('/organization')
  .use(authMiddleware)
  /**
   * [GET] /organization
   * The caller's organization and their role in it.
   */
  .get('/', async (c) => {
    const user = c.get('user');
    return c.json(await getOrganizationForUser({ userId: user.id }));
  })
  /**
   * [GET] /organization/usage
   * Credit usage grouped by member. Owner and admins only.
   */
  .get('/usage', async (c) => {
    const user = c.get('user');
    return c.json(await getUsageByMemberForUser({ userId: user.id }));
  })
  /**
   * [DELETE] /organization/members/:memberId
   * Soft-deletes a member. Owner and admins only; the owner cannot be removed.
   */
  .delete('/members/:memberId', validMemberIdParam, async (c) => {
    const user = c.get('user');
    const { memberId } = c.req.valid('param');
    await removeMemberForUser({ userId: user.id, memberId });
    return c.json({ success: true });
  })
  /**
   * [POST] /organization/members/:memberId/restore
   * Restores a removed member. Owner and admins only.
   */
  .post('/members/:memberId/restore', validMemberIdParam, async (c) => {
    const user = c.get('user');
    const { memberId } = c.req.valid('param');
    await restoreMemberForUser({ userId: user.id, memberId });
    return c.json({ success: true });
  })
  /**
   * [POST] /organization/leave
   * Soft-deletes the caller's own account. The owner cannot leave.
   */
  .post('/leave', async (c) => {
    const user = c.get('user');
    await leaveOrganization({ userId: user.id });
    return c.json({ success: true });
  })
  /**
   * [POST] /organization/transfer-ownership
   * Owner only: the target becomes owner, the caller becomes admin.
   */
  .post('/transfer-ownership', validTransferOwnershipBody, async (c) => {
    const user = c.get('user');
    const { memberId } = c.req.valid('json');
    await transferOwnershipForUser({ userId: user.id, memberId });
    return c.json({ success: true });
  });
