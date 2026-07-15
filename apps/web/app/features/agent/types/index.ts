export interface AgentAiModelRef {
  provider: string;
  model: string;
  displayName: string;
}

export interface Agent {
  id: string;
  userId: string;
  aiModelId: string;
  name: string;
  systemPrompt: string;
  description?: string;
  tools?: string[];
  isDefault: boolean;
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
