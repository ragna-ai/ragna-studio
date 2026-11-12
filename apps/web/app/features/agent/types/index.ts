import type {
  AgentMarkIcon,
  AgentMarkTone,
  AgentToolGrant,
} from '@repo/ai/client';

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

/** What `AgentMark` needs besides the agent's id. Unset fields fall back to the id-derived look. */
export interface AgentMarkFields {
  icon?: string | null;
  tone?: string | null;
  imageUrl?: string | null;
}

export interface Agent extends AgentMarkFields {
  id: string;
  userId: string | null;
  // Every agent lives in exactly one workspace.
  workspaceId: string;
  aiModelId: string;
  name: string;
  systemPrompt: string;
  description?: string;
  context?: string | null;
  toolGrants?: AgentToolGrant[];
  settings?: AgentSettings | null;
  aiModel?: AgentAiModelRef;
  // Soft pin: the dataset injected into this
  // agent's system prompt when the `datasets` tool is enabled.
  defaultDatasetId?: string | null;
  // The uploaded image behind `imageUrl`; saved with the agent.
  imageMediaId?: string | null;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  aiModel: { displayName: string };
}

export interface AgentTemplateManyResponse {
  templates: AgentTemplate[];
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
// of one upsert.
export type CreateAgentRequest = Omit<
  Agent,
  | 'id'
  | 'userId'
  | 'workspaceId'
  | 'aiModel'
  | 'icon'
  | 'tone'
  | 'imageUrl'
  | 'imageMediaId'
>;

// The mark is edited on existing agents only; the create flow follows later.
export type UpdateAgentRequest = Partial<CreateAgentRequest> &
  Pick<Agent, 'icon' | 'tone' | 'imageMediaId'>;

/** The mark as the agent form edits it. `imageUrl` is only for the preview; it is never sent. A picked file previews through a local object URL until the agent is saved. */
export interface AgentMarkValue {
  icon: AgentMarkIcon | null;
  tone: AgentMarkTone | null;
  imageMediaId: string | null;
  imageUrl: string | null;
}

export interface UploadedAgentImage {
  mediaId: string;
}

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
// text vs. injectionThreshold.
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
