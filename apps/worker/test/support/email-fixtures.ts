import type { AgentToolGrant } from '@repo/ai';
import type { Agent, EmailAccount, EmailIntegrationId } from '@repo/database';
import { createAgent, createEmailAccount } from '@repo/database';
import {
  seedAuthenticatedUser,
  seedGmailConnection,
  seedOutlookConnection,
  seedTokenPricedAiModel,
} from '@repo/testing';

export interface SeededMailUser {
  userId: string;
  personalWorkspaceId: string;
  sharedWorkspaceId: string;
  account: EmailAccount;
}

export interface SeedMailUserParams {
  integrationId?: EmailIntegrationId;
  syncCursor?: string;
  accessToken?: string;
  /** Scopes granted to the connection. Defaults to the mail scopes of the integration. */
  scopes?: string[];
}

/** A user with an email account row. The mail provider itself is mocked. */
export async function seedMailUser(params: SeedMailUserParams = {}): Promise<SeededMailUser> {
  const { userId, personalWorkspaceId, workspaceId } = await seedAuthenticatedUser();
  const integrationId = params.integrationId ?? 'gmail';
  const { connection } =
    integrationId === 'gmail'
      ? await seedGmailConnection({
          userId,
          accessToken: params.accessToken,
          scopes: params.scopes,
        })
      : await seedOutlookConnection({
          userId,
          accessToken: params.accessToken,
          scopes: params.scopes,
        });
  const account = await createEmailAccount({
    userId,
    connectionId: connection.id,
    integrationId,
    email: `mailbox-${crypto.randomUUID()}@example.test`,
    syncCursor: params.syncCursor ?? null,
  });

  return { userId, personalWorkspaceId, sharedWorkspaceId: workspaceId, account };
}

export interface SeedAgentParams {
  userId: string;
  workspaceId: string;
  name?: string;
  toolGrants?: AgentToolGrant[];
  defaultDatasetId?: string;
}

export async function seedAgent({
  userId,
  workspaceId,
  name,
  toolGrants,
  defaultDatasetId,
}: SeedAgentParams): Promise<Agent> {
  const { aiModelId } = await seedTokenPricedAiModel();

  return createAgent({
    userId,
    workspaceId,
    aiModelId,
    name: name ?? 'Draft Agent',
    systemPrompt: 'You draft email replies.',
    toolGrants,
    defaultDatasetId,
  });
}
