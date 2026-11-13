import { AGENT_MARK_TONES, type AgentMarkTone } from '@repo/ai/client';

// Utility classes are written out in full so Tailwind can detect them.
export const AGENT_TONE_CLASS: Record<AgentMarkTone, string> = {
  sea: 'bg-id-sea-bg text-id-sea-fg',
  sage: 'bg-id-sage-bg text-id-sage-fg',
  ochre: 'bg-id-ochre-bg text-id-ochre-fg',
  clay: 'bg-id-clay-bg text-id-clay-fg',
  dusk: 'bg-id-dusk-bg text-id-dusk-fg',
  plum: 'bg-id-plum-bg text-id-plum-fg',
  rose: 'bg-id-rose-bg text-id-rose-fg',
  stone: 'bg-id-stone-bg text-id-stone-fg',
};

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
