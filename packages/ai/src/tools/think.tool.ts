import type {
  InferToolInput,
  InferToolOutput,
  InferUITool,
  UIMessage,
  UIMessageStreamWriter,
} from 'ai';
import { tool } from 'ai';
import * as z from 'zod';

export const getThoughts = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
) =>
  tool({
    description:
      'Use the tool to think about something. It will not obtain new information or change the database, but just append the thought to the log. Use it when complex reasoning or brainstorming is needed.',
    inputSchema: z.object({
      thought: z.string().min(3).max(100000).describe('Your thoughts.'),
    }),
    execute: ({ thought }) => {
      // writer.write({
      //   type: 'data-tool-think',
      //   data: { text: thought },
      // });
      return { thought };
    },
  });

export type getThoughtsInput = InferToolInput<ReturnType<typeof getThoughts>>;
export type getThoughtsOutput = InferToolOutput<ReturnType<typeof getThoughts>>;
export type ThinkUiTool = InferUITool<ReturnType<typeof getThoughts>>;
