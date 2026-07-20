export interface ChatAgent {
  id: string;
  name: string;
  aiModel: {
    id: string;
    provider: string;
    displayName: string;
  };
}
