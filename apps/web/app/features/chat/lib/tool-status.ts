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
