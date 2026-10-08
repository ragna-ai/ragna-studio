import { getMemoryByAgentId, upsertMemory } from '@repo/database';
import { tryCatch } from '@repo/utils';
import type {
  InferToolInput,
  InferToolOutput,
  InferUITool,
  Tool,
  UIMessage,
  UIMessageStreamWriter,
} from 'ai';
import { tool } from 'ai';
import * as z from 'zod';

// A flat object schema (not a discriminated union): Anthropic's tool
// `input_schema` must have a top-level `type: "object"`, but a zod union
// compiles to top-level `anyOf` with no `type`, which the API rejects.
// Field applicability per `action` is enforced at runtime in applyMemoryEdit.
const memoryInputSchema = z.object({
  action: z
    .enum(['append', 'replace'])
    .describe(
      '`append` adds a new fact to the end of the memory document. `replace` swaps existing text (use an empty `new` to delete a fact).',
    ),
  text: z
    .string()
    .optional()
    .describe(
      'For `append`: a durable fact about the user or their work, worth remembering in future conversations. Do not save transient or trivial details.',
    ),
  old: z
    .string()
    .optional()
    .describe(
      'For `replace`: the exact existing text to find. Quote enough surrounding context that it matches exactly one place in the document.',
    ),
  new: z
    .string()
    .optional()
    .describe('For `replace`: the replacement text. Leave empty to delete the matched text.'),
});

type MemoryInput = z.infer<typeof memoryInputSchema>;
type MemoryOutput = { ok: true } | { error: string };

export const getMemoryTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  agentId: string,
): Tool<MemoryInput, MemoryOutput> =>
  tool({
    description:
      'Use this tool to save or update durable, long-term facts about the user or their work in your persistent memory. The whole document is shown to you again at the start of every future conversation. `append` adds a new fact; `replace` edits or removes one you saved earlier.',
    inputSchema: memoryInputSchema,
    execute: async (input) => {
      // emit tool usage message
      writer.write({
        type: 'data-memory',
        data: input,
        transient: true,
      });

      const { error, data: result } = await tryCatch(() => applyMemoryEdit(agentId, input), {
        retryOnFailure: false,
      });

      if (error !== null || result === null) {
        return { error: 'Failed to update memory. Please try again.' };
      }

      return result;
    },
  });

// Read-modify-write. Safe because tool calls within a turn run sequentially,
// so the unique-agentId upsert is the only last-writer-wins boundary.
async function applyMemoryEdit(agentId: string, input: MemoryInput): Promise<MemoryOutput> {
  const memory = await getMemoryByAgentId({ agentId });
  const content = memory?.content ?? '';

  let edit: Edit;

  if (input.action === 'append') {
    if (!input.text) {
      return { error: '`append` requires `text`.' };
    }
    edit = appendText(content, input.text);
  } else {
    if (!input.old) {
      return { error: '`replace` requires `old`.' };
    }
    edit = replaceText(content, input.old, input.new ?? '');
  }

  if ('error' in edit) {
    return edit;
  }

  await upsertMemory({ agentId, content: edit.content });

  return { ok: true };
}

type Edit = { content: string } | { error: string };

function appendText(content: string, text: string): Edit {
  return { content: content.length === 0 ? text : `${content}\n\n${text}` };
}

// Requires a unique match, the same guard the Anthropic `str_replace` memory
// tool uses: it forces the model to quote enough context to be unambiguous.
function replaceText(content: string, oldText: string, newText: string): Edit {
  const occurrences = countOccurrences(content, oldText);

  if (occurrences === 0) {
    return { error: 'Text not found in memory document.' };
  }

  if (occurrences > 1) {
    return {
      error: `Text appears ${occurrences} times in memory document. Include more surrounding context so it matches only one place.`,
    };
  }

  return { content: content.replace(oldText, newText) };
}

function countOccurrences(content: string, needle: string): number {
  let count = 0;
  let index = content.indexOf(needle);

  while (index !== -1) {
    count += 1;
    index = content.indexOf(needle, index + needle.length);
  }

  return count;
}

export type getMemoryToolInput = InferToolInput<ReturnType<typeof getMemoryTool>>;
export type getMemoryToolOutput = InferToolOutput<ReturnType<typeof getMemoryTool>>;
export type MemoryUiTool = InferUITool<ReturnType<typeof getMemoryTool>>;
