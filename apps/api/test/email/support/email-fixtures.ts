// apps/api/test/email/support/email-fixtures.ts
import type { EmailAccount } from '@repo/database';
import {
  getProfileMock,
  seedGmailConnection,
  seedOutlookConnection,
  seedTokenPricedAiModel,
} from '@repo/testing';
import * as z from 'zod';
import { app } from '../../../src/app';

export interface ConnectedGmailAccount {
  userId: string;
  accountId: string;
  connectionId: string;
  email: string;
}

interface ConnectEmailAccountResult {
  accountId: string;
  email: string;
}

async function connectEmailAccountRequest({
  cookieHeader,
  provider,
  connectionId,
  email,
}: {
  cookieHeader: string;
  provider: 'gmail' | 'microsoft';
  connectionId: string;
  email?: string;
}): Promise<ConnectEmailAccountResult> {
  if (email) {
    getProfileMock.mockImplementationOnce(() =>
      Promise.resolve({ emailAddress: email, cursor: 'history-cursor-0' }),
    );
  }

  const response = await app.request('/email/account/connect', {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ provider, connectionId }),
  });

  if (response.status !== 201) {
    throw new Error(`connectEmailAccountRequest: connect failed with status ${response.status}`);
  }

  const body = z
    .object({ account: z.object({ id: z.string(), email: z.string() }) })
    .parse(await response.json());

  return { accountId: body.account.id, email: body.account.email };
}

export async function seedConnectedGmailAccount({
  userId,
  cookieHeader,
  email,
}: {
  userId: string;
  cookieHeader: string;
  email?: string;
}): Promise<ConnectedGmailAccount> {
  const { connection } = await seedGmailConnection({ userId, externalEmail: email ?? null });
  const connected = await connectEmailAccountRequest({
    cookieHeader,
    provider: 'gmail',
    connectionId: connection.id,
    email,
  });

  return {
    userId,
    accountId: connected.accountId,
    connectionId: connection.id,
    email: connected.email,
  };
}

export async function seedConnectedMicrosoftAccount({
  userId,
  cookieHeader,
  email,
}: {
  userId: string;
  cookieHeader: string;
  email?: string;
}): Promise<ConnectedGmailAccount> {
  const { connection } = await seedOutlookConnection({ userId, externalEmail: email ?? null });
  const connected = await connectEmailAccountRequest({
    cookieHeader,
    provider: 'microsoft',
    connectionId: connection.id,
    email,
  });

  return {
    userId,
    accountId: connected.accountId,
    connectionId: connection.id,
    email: connected.email,
  };
}

export async function createAgentForWorkspace(
  cookieHeader: string,
  workspaceId: string,
): Promise<string> {
  const { aiModelId } = await seedTokenPricedAiModel();

  const response = await app.request(`/workspace/${workspaceId}/agent`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Draft Agent',
      aiModelId,
      systemPrompt: 'You draft email replies.',
    }),
  });

  const body = z.object({ agent: z.object({ id: z.string() }) }).parse(await response.json());
  return body.agent.id;
}

export type { EmailAccount };
