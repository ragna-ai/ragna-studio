import type { AgentToolId } from '@repo/ai/client';

/** Hugeicons name per agent tool id, shared by the agent settings and the chat. */
export const AGENT_TOOL_ICONS = {
  think: 'hugeicons:ai-brain-01',
  memory: 'hugeicons:notebook-02',
  webSearch: 'hugeicons:globe-02',
  webBrowser: 'hugeicons:web-design-01',
  imageGen: 'hugeicons:image-01',
  videoGen: 'hugeicons:video-replay',
  linkedinDraft: 'hugeicons:linkedin-01',
  documents: 'hugeicons:file-02',
  tasks: 'hugeicons:check-list',
  datasets: 'hugeicons:grid-table',
  'google-drive': 'hugeicons:google-drive',
} as const satisfies Record<AgentToolId, string>;

const iconsById: Record<string, string> = AGENT_TOOL_ICONS;

export function getAgentToolIcon(toolId: string): string | undefined {
  return iconsById[toolId];
}
