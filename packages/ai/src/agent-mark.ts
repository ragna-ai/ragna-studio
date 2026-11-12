import * as z from 'zod';

/** Hugeicons names an agent can use as its icon, in picker order. */
export const AGENT_MARK_ICONS = [
  'robotic',
  'invoice-01',
  'receipt-text',
  'mail-01',
  'inbox',
  'file-edit',
  'file-02',
  'file-validation',
  'search-01',
  'calendar-03',
  'chart-line-data-01',
  'money-bag-02',
  'calculator-01',
  'bank',
  'truck-delivery',
  'package',
  'shopping-cart-01',
  'building-03',
  'user-group',
  'call',
  'wrench-01',
  'settings-02',
  'task-done-01',
  'note-edit',
  'clipboard',
  'justice-scale-01',
  'shield-01',
  'database-01',
] as const;

export const agentMarkIconSchema = z.enum(AGENT_MARK_ICONS);
export type AgentMarkIcon = z.infer<typeof agentMarkIconSchema>;

/** Colour pairs an agent can use behind its icon, in picker order. */
export const AGENT_MARK_TONES = [
  'sea',
  'sage',
  'ochre',
  'clay',
  'dusk',
  'plum',
  'rose',
  'stone',
] as const;

export const agentMarkToneSchema = z.enum(AGENT_MARK_TONES);
export type AgentMarkTone = z.infer<typeof agentMarkToneSchema>;
