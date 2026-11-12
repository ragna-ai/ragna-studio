import type { AgentMarkFields } from '~/features/agent/types';

export interface ChatAgent extends AgentMarkFields {
  id: string;
  name: string;
  aiModel: {
    id: string;
    provider: string;
    displayName: string;
  };
}

export interface ChatAgentOption extends AgentMarkFields {
  id: string;
  name: string;
  description?: string;
  aiModel?: { displayName: string };
}

export interface ToolApprovalDecision {
  id: string;
  approved: boolean;
}

/** Slim chat row shown in recent-chat lists. */
export interface ChatRecentItem {
  id: string;
  title: string;
  agentName: string;
  lastMessageAt: string;
}

export interface ChatRecentRowItem extends ChatRecentItem, AgentMarkFields {
  agentId: string;
}
