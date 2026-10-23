import type { Agent, AgentTools, EmailAccount, EmailProvider } from '@repo/database';
import { createAgent, createEmailAccount } from '@repo/database';
import { seedAuthenticatedUser, seedTokenPricedAiModel } from '@repo/testing';

export interface SeededMailUser {
  userId: string;
  personalWorkspaceId: string;
  sharedWorkspaceId: string;
  account: EmailAccount;
}

export interface SeedMailUserParams {
  provider?: EmailProvider;
  syncCursor?: string;
}

/** A user with an email account row. The mail provider itself is mocked. */
export async function seedMailUser(params: SeedMailUserParams = {}): Promise<SeededMailUser> {
  const { userId, personalWorkspaceId, workspaceId } = await seedAuthenticatedUser();
  const account = await createEmailAccount({
    userId,
    provider: params.provider ?? 'gmail',
    email: `mailbox-${crypto.randomUUID()}@example.test`,
    syncCursor: params.syncCursor ?? null,
  });

  return { userId, personalWorkspaceId, sharedWorkspaceId: workspaceId, account };
}

export interface SeedAgentParams {
  userId: string;
  workspaceId: string;
  name?: string;
  tools?: AgentTools;
  defaultDatasetId?: string;
}

export async function seedAgent({
  userId,
  workspaceId,
  name,
  tools,
  defaultDatasetId,
}: SeedAgentParams): Promise<Agent> {
  const { aiModelId } = await seedTokenPricedAiModel();

  return createAgent({
    userId,
    workspaceId,
    aiModelId,
    name: name ?? 'Draft Agent',
    systemPrompt: 'You draft email replies.',
    tools,
    defaultDatasetId,
  });
}
