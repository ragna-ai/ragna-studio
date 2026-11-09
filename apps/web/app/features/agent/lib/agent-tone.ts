export type AgentTone = 'sea' | 'sage' | 'ochre' | 'clay';

const AGENT_TONES: readonly AgentTone[] = ['sea', 'sage', 'ochre', 'clay'];

export const AGENT_TONE_CLASS: Record<AgentTone, string> = {
  sea: 'bg-id-sea-bg text-id-sea-fg',
  sage: 'bg-id-sage-bg text-id-sage-fg',
  ochre: 'bg-id-ochre-bg text-id-ochre-fg',
  clay: 'bg-id-clay-bg text-id-clay-fg',
};

/** Stable tone per agent until agents store their own colour. */
export function agentTone(agentId: string): AgentTone {
  let hash = 0;
  for (const char of agentId) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return AGENT_TONES[hash % AGENT_TONES.length] ?? 'sea';
}
