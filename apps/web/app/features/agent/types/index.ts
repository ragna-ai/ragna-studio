export interface AgentAiModelRef {
  provider: string;
  model: string;
  displayName: string;
}

export interface AgentSettings {
  temperature?: number | null;
  maxOutputTokens?: number | null;
}

export interface Agent {
  id: string;
  userId: string;
  workspaceId?: string | null;
  aiModelId: string;
  name: string;
  systemPrompt: string;
  description?: string;
  context?: string | null;
  tools?: string[];
  isDefault: boolean;
  settings?: AgentSettings | null;
  aiModel?: AgentAiModelRef;
  // Soft pin (docs/datasets.md decision 10): the dataset injected into this
  // agent's system prompt when the `datasets` tool is enabled.
  defaultDatasetId?: string | null;
}

export interface AgentResponse {
  agent: Agent;
}

export interface AgentManyResponse {
  agents: Agent[];
  meta: {
    totalCount: number;
  };
}

export type UpsertAgentRequest = Omit<Agent, 'id' | 'userId'> & {
  id: string | null;
  userId: string | null;
};

export interface AgentMemory {
  content: string;
}

export interface AgentMemoryResponse {
  memory: AgentMemory;
}

export type UpdateAgentMemoryRequest = AgentMemory;

export type AgentContextDocumentStatus = 'pending' | 'ready' | 'failed';

export interface AgentContextDocument {
  id: string;
  name: string;
  mimeType: string;
  fileSize: number;
  status: AgentContextDocumentStatus;
  isTruncated: boolean;
  errorMessage: string | null;
  updatedAt: string;
}

export interface AgentContextDocumentManyResponse {
  documents: AgentContextDocument[];
}

export interface AgentContextDocumentResponse {
  document: AgentContextDocument;
}
