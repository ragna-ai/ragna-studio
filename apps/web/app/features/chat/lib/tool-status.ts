import type { ToolUIPart } from 'ai';
import type { StatusPillTone } from '~/components/StatusPill.vue';

export type ToolState = ToolUIPart['state'];

export const TOOL_STATE_TONE: Record<ToolState, StatusPillTone> = {
  'input-streaming': 'agent',
  'input-available': 'agent',
  'approval-requested': 'warn',
  'approval-responded': 'neutral',
  'output-available': 'ok',
  'output-error': 'danger',
  'output-denied': 'neutral',
};

export type ToolLineStatus = 'running' | 'done' | 'failed';

const TERMINAL_TOOL_STATES: ToolState[] = [
  'output-available',
  'output-error',
  'output-denied',
];

export function isToolRunning(state: ToolState): boolean {
  return !TERMINAL_TOOL_STATES.includes(state);
}

export function toolLineStatus(state: ToolState): ToolLineStatus {
  if (isToolRunning(state)) return 'running';
  return state === 'output-error' ? 'failed' : 'done';
}
