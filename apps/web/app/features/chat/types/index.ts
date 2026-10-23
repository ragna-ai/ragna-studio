export interface ChatAgent {
  id: string;
  name: string;
  aiModel: {
    id: string;
    provider: string;
    displayName: string;
  };
}

export interface ChatAgentOption {
  id: string;
  name: string;
  description?: string;
  aiModel?: { displayName: string };
}
