import { problemDetailsSchema, problemTypeUri, type ProblemType } from '@repo/api-errors';
import {
  seedAuthenticatedUser,
  seedOrganizationMember,
  seedTokenPricedAiModel,
} from '@repo/testing';
import { expect } from 'bun:test';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  insertWorkspaceMember,
  seedOrganizationWithRoles,
  type SeededUser,
} from '../workspace/workspace-access-fixtures';

const userReferenceSchema = z.strictObject({ id: z.string(), name: z.string() });

export const lockSchema = z.strictObject({
  versionId: z.string(),
  versionNumber: z.number(),
  lockedBy: userReferenceSchema.nullable(),
  lockedAt: z.iso.datetime(),
  approval: z
    .strictObject({ approvedBy: userReferenceSchema.nullable(), approvedAt: z.iso.datetime() })
    .nullable(),
});

export const lockActionsSchema = z.strictObject({
  canLock: z.boolean(),
  canUnlock: z.boolean(),
  canApprove: z.boolean(),
  canRevoke: z.boolean(),
});

export const lockResponseSchema = z.strictObject({ lock: lockSchema.nullable() });

const agentDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  systemPrompt: z.string(),
  context: z.string().nullable(),
  toolGrants: z.array(z.object({ id: z.string(), access: z.string().optional() })),
  defaultDatasetId: z.string().nullable(),
  aiModelId: z.string(),
  lock: lockSchema.nullable(),
  lockActions: lockActionsSchema,
});

export const versionSchema = z.strictObject({
  id: z.string(),
  versionNumber: z.number(),
  lockedAt: z.iso.datetime(),
  approvedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  unlockedAt: z.iso.datetime().nullable(),
  lockedBy: userReferenceSchema.nullable(),
  approvedBy: userReferenceSchema.nullable(),
  revokedBy: userReferenceSchema.nullable(),
  unlockedBy: userReferenceSchema.nullable(),
});

export const usageSchema = z.strictObject({
  workflowCount: z.number(),
  assignedTaskCount: z.number(),
});

export interface LockTeam {
  workspaceId: string;
  aiModelId: string;
  /** Organization owner: the highest rank. */
  owner: SeededUser;
  /** Organization admin: above every workspace manager. */
  admin: SeededUser;
  /** A second organization admin, for the same-rank cases. */
  otherAdmin: SeededUser;
  /** Workspace manager without any organization role. */
  manager: SeededUser;
  /** Plain workspace editors. */
  editor: SeededUser;
  otherEditor: SeededUser;
}

/** One organization workspace with a user at every rank. */
export async function seedLockTeam(): Promise<LockTeam> {
  const organization = await seedOrganizationWithRoles();
  const workspaceId = organization.owner.workspaceId;
  const manager = await seedOrganizationMember({
    organizationId: organization.organizationId,
    role: 'member',
  });
  await insertWorkspaceMember({ workspaceId, userId: manager.userId, role: 'manager' });
  const otherAdmin = await seedOrganizationMember({
    organizationId: organization.organizationId,
    role: 'admin',
  });
  const { aiModelId } = await seedTokenPricedAiModel();

  return {
    workspaceId,
    aiModelId,
    owner: organization.owner,
    admin: organization.admin,
    otherAdmin,
    manager,
    editor: organization.member,
    otherEditor: organization.otherMember,
  };
}

export async function seedSoloWorkspace() {
  const { userId, workspaceId, cookieHeader } = await seedAuthenticatedUser();
  const { aiModelId } = await seedTokenPricedAiModel();
  return { userId, workspaceId, cookieHeader, aiModelId };
}

function jsonRequest(cookieHeader: string, method: string, body?: Record<string, unknown>) {
  return {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

export async function createAgent(
  user: SeededUser,
  body: Record<string, unknown> & { aiModelId: string },
): Promise<string> {
  const response = await app.request(
    `/workspace/${user.workspaceId}/agent`,
    jsonRequest(user.cookieHeader, 'POST', { name: 'Support bot', systemPrompt: 'Help.', ...body }),
  );
  return z.object({ agent: z.object({ id: z.string() }) }).parse(await response.json()).agent.id;
}

/** Requests against one agent's lock routes, as the given user. */
export function agentRoutes({ workspaceId, agentId }: { workspaceId: string; agentId: string }) {
  const base = `/workspace/${workspaceId}/agent/${agentId}`;
  return {
    detail: async (user: SeededUser) => {
      const response = await app.request(base, { headers: { cookie: user.cookieHeader } });
      return z.object({ agent: agentDetailSchema }).parse(await response.json()).agent;
    },
    lock: (user: SeededUser) => app.request(`${base}/lock`, jsonRequest(user.cookieHeader, 'POST')),
    unlock: (user: SeededUser) =>
      app.request(`${base}/lock`, jsonRequest(user.cookieHeader, 'DELETE')),
    approve: (user: SeededUser) =>
      app.request(`${base}/unattended-approval`, jsonRequest(user.cookieHeader, 'POST')),
    revoke: (user: SeededUser) =>
      app.request(`${base}/unattended-approval`, jsonRequest(user.cookieHeader, 'DELETE')),
    versions: (user: SeededUser) =>
      app.request(`${base}/versions`, { headers: { cookie: user.cookieHeader } }),
    usage: (user: SeededUser) =>
      app.request(`${base}/usage`, { headers: { cookie: user.cookieHeader } }),
    patch: (user: SeededUser, body: Record<string, unknown>) =>
      app.request(base, jsonRequest(user.cookieHeader, 'PATCH', body)),
    remove: (user: SeededUser) => app.request(base, jsonRequest(user.cookieHeader, 'DELETE')),
  };
}

export async function expectProblem(response: Response, status: number, type: ProblemType) {
  expect(response.status).toBe(status);
  const problem = problemDetailsSchema.parse(await response.json());
  expect(problem.type).toBe(problemTypeUri(type));
}
