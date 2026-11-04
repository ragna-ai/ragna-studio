import { seedAuthenticatedUser } from '@repo/testing';
import * as z from 'zod';
import { app } from '../../src/app';
import {
  insertWorkspace,
  insertWorkspaceMember,
  seedOrganizationWithRoles,
} from '../workspace/workspace-access-fixtures';

const idSchema = z.object({ id: z.string() });

export function jsonRequest(cookieHeader: string, method: string, body: Record<string, unknown>) {
  return {
    method,
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function getRequest(cookieHeader: string) {
  return { headers: { cookie: cookieHeader } };
}

export async function createFolder(
  cookieHeader: string,
  workspaceId: string,
  name = 'Folder',
): Promise<string> {
  const response = await app.request(
    `/workspace/${workspaceId}/folder`,
    jsonRequest(cookieHeader, 'POST', { name }),
  );
  return z.object({ folder: idSchema }).parse(await response.json()).folder.id;
}

export interface DocumentInput {
  title?: string;
  folderId?: string | null;
}

export function postDocument(cookieHeader: string, workspaceId: string, input: DocumentInput = {}) {
  return app.request(
    `/workspace/${workspaceId}/document`,
    jsonRequest(cookieHeader, 'POST', {
      title: input.title ?? 'A document',
      folderId: input.folderId,
    }),
  );
}

export async function createDocument(
  cookieHeader: string,
  workspaceId: string,
  input: DocumentInput = {},
): Promise<string> {
  const response = await postDocument(cookieHeader, workspaceId, input);
  return z.object({ document: idSchema }).parse(await response.json()).document.id;
}

export async function createOrganizationWorkspace(cookieHeader: string): Promise<string> {
  const response = await app.request(
    '/workspace',
    jsonRequest(cookieHeader, 'POST', { name: 'Second', visibility: 'organization' }),
  );
  return z.object({ workspace: idSchema }).parse(await response.json()).workspace.id;
}

export interface ForeignWorkspaceCase {
  name: string;
  setup: () => Promise<ForeignWorkspaceSetup>;
}

/** The caller acts in workspace A. Workspace B belongs to someone else or is another workspace. */
export interface ForeignWorkspaceSetup {
  cookieHeader: string;
  workspaceId: string;
  foreignCookieHeader: string;
  foreignWorkspaceId: string;
}

export const foreignWorkspaceCases: ForeignWorkspaceCase[] = [
  {
    name: 'another workspace of the same organization',
    setup: async () => {
      const user = await seedAuthenticatedUser();
      const foreignWorkspaceId = await createOrganizationWorkspace(user.cookieHeader);
      return {
        cookieHeader: user.cookieHeader,
        workspaceId: user.workspaceId,
        foreignCookieHeader: user.cookieHeader,
        foreignWorkspaceId,
      };
    },
  },
  {
    name: 'a workspace of another organization',
    setup: async () => {
      const userA = await seedAuthenticatedUser();
      const userB = await seedAuthenticatedUser();
      return {
        cookieHeader: userA.cookieHeader,
        workspaceId: userA.workspaceId,
        foreignCookieHeader: userB.cookieHeader,
        foreignWorkspaceId: userB.workspaceId,
      };
    },
  },
];

export interface InaccessibleWorkspaceCase {
  name: string;
  setup: () => Promise<InaccessibleWorkspaceSetup>;
}

/** The caller has no access to the workspace, but its owner has. */
export interface InaccessibleWorkspaceSetup {
  cookieHeader: string;
  workspaceId: string;
  ownerCookieHeader: string;
}

export const inaccessibleWorkspaceCases: InaccessibleWorkspaceCase[] = [
  {
    name: 'a workspace of another organization',
    setup: async () => {
      const caller = await seedAuthenticatedUser();
      const owner = await seedAuthenticatedUser();
      return {
        cookieHeader: caller.cookieHeader,
        workspaceId: owner.workspaceId,
        ownerCookieHeader: owner.cookieHeader,
      };
    },
  },
  {
    name: "a colleague's personal workspace",
    setup: async () => {
      const { member, otherMember } = await seedOrganizationWithRoles();
      return {
        cookieHeader: otherMember.cookieHeader,
        workspaceId: member.personalWorkspaceId,
        ownerCookieHeader: member.cookieHeader,
      };
    },
  },
  {
    name: 'a restricted workspace the caller is not a member of',
    setup: async () => {
      const { organizationId, owner, member } = await seedOrganizationWithRoles();
      const workspaceId = await insertWorkspace({ organizationId, visibility: 'restricted' });
      await insertWorkspaceMember({ workspaceId, userId: owner.userId, role: 'manager' });
      return {
        cookieHeader: member.cookieHeader,
        workspaceId,
        ownerCookieHeader: owner.cookieHeader,
      };
    },
  },
];
