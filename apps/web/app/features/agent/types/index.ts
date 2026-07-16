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
