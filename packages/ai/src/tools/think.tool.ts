import * as z from 'zod';
import type { ToolDefinition } from './tool-definition';

const thinkInputSchema = z.object({
  thought: z.string().min(3).max(100000).describe('Your thoughts.'),
});

interface ThinkOutput {
  thought: string;
}

export const thinkToolDefinition: ToolDefinition<typeof thinkInputSchema, ThinkOutput> = {
  name: 'think',
  description:
    'Use the tool to think about something. It will not obtain new information or change the database, but just append the thought to the log. Use it when complex reasoning or brainstorming is needed.',
  inputSchema: thinkInputSchema,
  access: 'read',
  execute: async ({ thought }) => ({ thought }),
};
