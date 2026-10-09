import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  deleteOrganizationForUser,
  getOrganizationForUser,
  getUsageByMemberForUser,
  listMembersForUser,
  leaveOrganization,
  listRestrictedWorkspacesForUser,
  removeMemberForUser,
  restoreMemberForUser,
  restoreOrganizationForUser,
  transferOwnershipForUser,
} from '../services/organization.service';
import { validMemberIdParam, validTransferOwnershipBody } from '../validation';

// The caller's organization is their single membership, so no workspaceGuard.
export const organizationController = new Hono()
  .basePath('/organization')
  .use(authMiddleware)
  /**
   * [GET] /organization
   * The caller's organization, their role in it and `deletedAt` while it is soft-deleted.
   */
  .get('/', async (c) => {
    const user = c.get('user');
    const organization = await getOrganizationForUser({ userId: user.id });
    return c.json(organization);
  })
  /**
   * [GET] /organization/members
   * Every member of the caller's organization, removed ones with `user.deletedAt`.
   */
  .get('/members', async (c) => {
    const user = c.get('user');
    const members = await listMembersForUser({ userId: user.id });
    return c.json(members);
  })
  /**
   * [GET] /organization/workspaces
   * Every restricted workspace with its member count. Owner and admins only.
   */
  .get('/workspaces', async (c) => {
    const user = c.get('user');
    const workspaces = await listRestrictedWorkspacesForUser({ userId: user.id });
    return c.json(workspaces);
  })
  /**
   * [DELETE] /organization
   * Soft-deletes the organization. Owner only; restorable for 30 days.
   */
  .delete('/', async (c) => {
    const user = c.get('user');
    await deleteOrganizationForUser({ userId: user.id });
    return c.json({ success: true });
  })
  /**
   * [POST] /organization/restore
   * Restores a soft-deleted organization and the members its deletion banned. Owner only.
   */
  .post('/restore', async (c) => {
    const user = c.get('user');
    await restoreOrganizationForUser({ userId: user.id });
    return c.json({ success: true });
  })
  /**
   * [GET] /organization/usage
   * Credit usage grouped by member. Owner and admins only.
   */
  .get('/usage', async (c) => {
    const user = c.get('user');
    const usage = await getUsageByMemberForUser({ userId: user.id });
    return c.json(usage);
  })
  /**
   * [DELETE] /organization/members/:memberId
   * Soft-deletes a member. Owner and admins only; the owner cannot be removed.
   */
  .delete('/members/:memberId', validMemberIdParam, async (c) => {
    const user = c.get('user');
    const { memberId } = c.req.valid('param');
    await removeMemberForUser({ userId: user.id, organizationMemberId: memberId });
    return c.json({ success: true });
  })
  /**
   * [POST] /organization/members/:memberId/restore
   * Restores a removed member. Owner and admins only.
   */
  .post('/members/:memberId/restore', validMemberIdParam, async (c) => {
    const user = c.get('user');
    const { memberId } = c.req.valid('param');
    await restoreMemberForUser({ userId: user.id, organizationMemberId: memberId });
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
    await transferOwnershipForUser({ userId: user.id, organizationMemberId: memberId });
    return c.json({ success: true });
  });
