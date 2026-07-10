export interface Agent {
  id: string;
  userId: string;
  aiModelId: string;
  name: string;
  systemPrompt: string;
  description?: string;
  tools?: string[];
  isDefault: boolean;
}

export interface AgentResponse {
  agent: Agent;
}

export interface AgentManyResponse {
  agents: Agent[];
}

export type UpsertAgentRequest = Omit<Agent, 'id' | 'userId'> & {
  id?: string;
  userId?: string;
};
