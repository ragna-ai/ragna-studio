export interface AgentAiModelRef {
  provider: string;
  model: string;
  displayName: string;
}

export type AgentReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface AgentSettings {
  temperature?: number | null;
  maxOutputTokens?: number | null;
  reasoning?: AgentReasoningEffort | null;
}

export interface Agent {
  id: string;
  userId: string;
  // Every agent lives in exactly one workspace (specs/api-standards/prd.md).
  workspaceId: string;
  aiModelId: string;
  name: string;
  systemPrompt: string;
  description?: string;
  context?: string | null;
  tools?: string[];
  isDefault: boolean;
  settings?: AgentSettings | null;
  aiModel?: AgentAiModelRef;
  // Soft pin (specs/datasets.md decision 10): the dataset injected into this
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

// workspaceId is never part of the body: it comes from the path
// (`/workspace/:workspaceId/agent`). The client knows whether it is
// creating or editing, so create and update are separate requests instead
// of one upsert (specs/api-standards/prd.md).
export type CreateAgentRequest = Omit<
  Agent,
  'id' | 'userId' | 'workspaceId' | 'aiModel'
>;

export type UpdateAgentRequest = Partial<CreateAgentRequest>;

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
  charCount: number;
  status: AgentContextDocumentStatus;
  isTruncated: boolean;
  errorMessage: string | null;
  updatedAt: string;
}

// The mode the agent's prompt pipeline picks based on total ready extracted
// text vs. injectionThreshold (specs/agent/agent-context-retrieval.md).
export type AgentContextDocumentMode = 'inject' | 'retrieval';

export interface AgentContextDocumentSummary {
  totalReadyChars: number;
  injectionThreshold: number;
  mode: AgentContextDocumentMode;
}

export interface AgentContextDocumentManyResponse {
  documents: AgentContextDocument[];
  summary: AgentContextDocumentSummary;
}

export interface AgentContextDocumentResponse {
  document: AgentContextDocument;
}
