import {
  WORKSPACE_EDITOR_ROLE,
  WORKSPACE_MANAGER_ROLE,
  WORKSPACE_VISIBILITY_ORGANIZATION,
  WORKSPACE_VISIBILITY_RESTRICTED,
} from '@repo/database';
import * as z from 'zod';
import { myzValidator } from '../utils/validator-wrapper';

const primaryId = z.uuidv7();
// Users come from better-auth, whose ids are not uuidv7.
const userId = z.string().min(1);

const workspaceRoleSchema = z.enum([WORKSPACE_MANAGER_ROLE, WORKSPACE_EDITOR_ROLE]);

export const validWorkspaceIdParam = myzValidator(
  'param',
  z.object({
    workspaceId: primaryId,
  }),
);

export const validWorkspaceMemberParam = myzValidator(
  'param',
  z.object({
    workspaceId: primaryId,
    userId,
  }),
);

const workspaceNameSchema = z.string().min(1).max(255);

export const validCreateWorkspaceBody = myzValidator(
  'json',
  z.object({
    name: workspaceNameSchema,
    visibility: z.enum([WORKSPACE_VISIBILITY_ORGANIZATION, WORKSPACE_VISIBILITY_RESTRICTED]),
    memberUserIds: z.array(userId).max(200).optional(),
  }),
);

export const validRenameWorkspaceBody = myzValidator(
  'json',
  z.object({ name: workspaceNameSchema }),
);

export const validAddWorkspaceMemberBody = myzValidator(
  'json',
  z.object({ userId, workspaceRole: workspaceRoleSchema }),
);

export const validChangeWorkspaceMemberRoleBody = myzValidator(
  'json',
  z.object({ workspaceRole: workspaceRoleSchema }),
);
