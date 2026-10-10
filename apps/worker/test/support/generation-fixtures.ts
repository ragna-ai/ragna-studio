import {
  createAgent,
  createAgentContextDocuments,
  createGenImageRecords,
  createGenVideoRecord,
} from '@repo/database';
import type { AgentContextDocument, GenImage, GenVideo } from '@repo/database';
import { seedAuthenticatedUser, seedTokenPricedAiModel } from '@repo/testing';

export interface SeedGenImageBatchParams {
  count?: number;
  withAuthor?: boolean;
}

export interface SeedGenImageBatchResult {
  userId: string;
  workspaceId: string;
  rows: GenImage[];
}

export async function seedGenImageBatch({
  count = 2,
  withAuthor = true,
}: SeedGenImageBatchParams = {}): Promise<SeedGenImageBatchResult> {
  const { userId, workspaceId } = await seedAuthenticatedUser();
  const records = Array.from({ length: count }, () => ({
    userId: withAuthor ? userId : null,
    workspaceId,
    prompt: 'a red bicycle',
    provider: 'bfl',
    model: 'flux-pro',
  }));
  const rows = await createGenImageRecords(records);
  return { userId, workspaceId, rows };
}

export interface SeedGenVideoParams {
  withAuthor?: boolean;
}

export interface SeedGenVideoResult {
  userId: string;
  workspaceId: string;
  row: GenVideo;
}

export async function seedGenVideo({
  withAuthor = true,
}: SeedGenVideoParams = {}): Promise<SeedGenVideoResult> {
  const { userId, workspaceId } = await seedAuthenticatedUser();
  const row = await createGenVideoRecord({
    userId: withAuthor ? userId : null,
    workspaceId,
    prompt: 'a drone shot over a city',
    provider: 'bfl',
    model: 'flux-3-video',
  });
  return { userId, workspaceId, row };
}

export interface SeedContextDocumentParams {
  mimeType?: string;
  fileSize?: number;
}

export interface SeedContextDocumentResult {
  agentId: string;
  document: AgentContextDocument;
}

export async function seedAgentWithPendingDocument({
  mimeType = 'text/plain',
  fileSize = 100,
}: SeedContextDocumentParams = {}): Promise<SeedContextDocumentResult> {
  const { userId, workspaceId } = await seedAuthenticatedUser();
  const { aiModelId } = await seedTokenPricedAiModel();
  const agent = await createAgent({
    userId,
    workspaceId,
    name: 'Support bot',
    aiModelId,
    systemPrompt: 'You are helpful.',
  });
  const [document] = await createAgentContextDocuments([
    {
      agentId: agent.id,
      name: 'notes.txt',
      storageKey: `agent-context/${crypto.randomUUID()}`,
      mimeType,
      fileSize,
    },
  ]);
  if (!document) throw new Error('Failed to seed agent context document');
  return { agentId: agent.id, document };
}

export interface SeedReadyDocumentParams {
  agentId: string;
  extractedTextLength: number;
}

export async function seedReadyDocument({
  agentId,
  extractedTextLength,
}: SeedReadyDocumentParams): Promise<void> {
  await createAgentContextDocuments([
    {
      agentId,
      name: 'existing.txt',
      storageKey: `agent-context/${crypto.randomUUID()}`,
      mimeType: 'text/plain',
      fileSize: extractedTextLength,
      status: 'ready',
      extractedText: 'x'.repeat(extractedTextLength),
    },
  ]);
}
