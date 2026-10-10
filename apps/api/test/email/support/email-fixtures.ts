// apps/api/test/email/support/email-fixtures.ts
import type { EmailAccount } from '@repo/database';
import {
  getProfileMock,
  seedGmailLinkedAccount,
  seedMicrosoftLinkedAccount,
  seedTokenPricedAiModel,
} from '@repo/testing';
import * as z from 'zod';
import { app } from '../../../src/app';

export interface ConnectedGmailAccount {
  userId: string;
  accountId: string;
  email: string;
}

interface ConnectEmailAccountResult {
  accountId: string;
  email: string;
}

async function connectEmailAccountRequest({
  cookieHeader,
  provider,
  email,
}: {
  cookieHeader: string;
  provider: 'gmail' | 'microsoft';
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
    body: JSON.stringify({ provider }),
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
  await seedGmailLinkedAccount({ userId });
  const connected = await connectEmailAccountRequest({ cookieHeader, provider: 'gmail', email });

  return { userId, ...connected };
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
  await seedMicrosoftLinkedAccount({ userId });
  const connected = await connectEmailAccountRequest({
    cookieHeader,
    provider: 'microsoft',
    email,
  });

  return { userId, ...connected };
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
