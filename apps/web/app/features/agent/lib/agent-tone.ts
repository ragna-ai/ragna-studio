import { AGENT_MARK_TONES, type AgentMarkTone } from '@repo/ai/client';

// Agents without a stored tone keep the colour they always had: one of the original four.
const FALLBACK_TONES: readonly AgentMarkTone[] = [
  'sea',
  'sage',
  'ochre',
  'clay',
];

/** Stable tone for an agent that has none of its own. */
export function fallbackAgentTone(agentId = ''): AgentMarkTone {
  let hash = 0;
  for (const char of agentId) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return FALLBACK_TONES[hash % FALLBACK_TONES.length] ?? 'sea';
}

export function isAgentMarkTone(
  value: string | null | undefined,
): value is AgentMarkTone {
  return AGENT_MARK_TONES.some((tone) => tone === value);
}
