import type { Agent, EmailAccount, EmailProvider } from '@repo/database';
import { createAgent, createEmailAccount, db } from '@repo/database';
import { agentTemplate } from '@repo/database/schema';
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

/** The template `resolveEmailDraftAgent` copies when it must create a workspace default agent. */
export async function seedDefaultAgentTemplate(): Promise<void> {
  const { aiModelId } = await seedTokenPricedAiModel();
  await db
    .insert(agentTemplate)
    .values({ aiModelId, name: 'Default', systemPrompt: 'Be helpful.' });
}

export interface SeedAgentParams {
  userId: string;
  workspaceId: string;
  name?: string;
}

export async function seedAgent({ userId, workspaceId, name }: SeedAgentParams): Promise<Agent> {
  const { aiModelId } = await seedTokenPricedAiModel();

  return createAgent({
    userId,
    workspaceId,
    aiModelId,
    name: name ?? 'Draft Agent',
    systemPrompt: 'You draft email replies.',
  });
}
