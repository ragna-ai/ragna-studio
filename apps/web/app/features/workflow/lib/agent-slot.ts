import type { AgentManyResponse } from '~/features/agent/types';

const LOADING_LABEL = '…';
const NO_AGENT_MESSAGE_KEY = 'workflow.agentPicker.none';
const DELETED_AGENT_MESSAGE_KEY = 'workflow.agentPicker.deleted';

type Translate = (key: string) => string;

/** The picker loads one page, so a missing id proves nothing unless the list is complete. */
function isAgentListComplete(agentsData: AgentManyResponse): boolean {
  return agentsData.meta.totalCount <= agentsData.agents.length;
}

/**
 * Ids of all workspace agents, or `null` while loading or when the list is
 * incomplete.
 */
export function getCompleteAgentIds(
  agentsData: AgentManyResponse | undefined,
): ReadonlySet<string> | null {
  if (!agentsData || !isAgentListComplete(agentsData)) {
    return null;
  }
  return new Set(agentsData.agents.map((agent) => agent.id));
}

/** What a lead or member slot shows: the agent name, or why there is none. */
export function getAgentSlotLabel(
  agentId: string,
  agentsData: AgentManyResponse | undefined,
  translate: Translate,
): string {
  if (!agentsData) {
    return LOADING_LABEL;
  }
  if (!agentId) {
    return translate(NO_AGENT_MESSAGE_KEY);
  }
  const agent = agentsData.agents.find((candidate) => candidate.id === agentId);
  if (agent) {
    return agent.name;
  }
  return isAgentListComplete(agentsData)
    ? translate(DELETED_AGENT_MESSAGE_KEY)
    : LOADING_LABEL;
}
