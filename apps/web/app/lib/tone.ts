import type { AgentMarkTone } from '@repo/ai/client';

// Utility classes are written out in full so Tailwind can detect them.
export const TONE_CLASS: Record<AgentMarkTone, string> = {
  sea: 'bg-id-sea-bg text-id-sea-fg',
  sage: 'bg-id-sage-bg text-id-sage-fg',
  ochre: 'bg-id-ochre-bg text-id-ochre-fg',
  clay: 'bg-id-clay-bg text-id-clay-fg',
  dusk: 'bg-id-dusk-bg text-id-dusk-fg',
  plum: 'bg-id-plum-bg text-id-plum-fg',
  rose: 'bg-id-rose-bg text-id-rose-fg',
  stone: 'bg-id-stone-bg text-id-stone-fg',
};

export const TONE_DOT_CLASS: Record<AgentMarkTone, string> = {
  sea: 'bg-id-sea-fg',
  sage: 'bg-id-sage-fg',
  ochre: 'bg-id-ochre-fg',
  clay: 'bg-id-clay-fg',
  dusk: 'bg-id-dusk-fg',
  plum: 'bg-id-plum-fg',
  rose: 'bg-id-rose-fg',
  stone: 'bg-id-stone-fg',
};
