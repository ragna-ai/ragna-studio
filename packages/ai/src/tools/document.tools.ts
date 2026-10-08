import type { DocumentWithRelations } from '@repo/database';
import {
  FOREIGN_REFERENCE_RESOURCE_LABEL,
  createDocument,
  getForeignReferenceResource,
  getDocumentById,
  getDocumentsByWorkspaceId,
  updateDocument,
} from '@repo/database';
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
import { optionalNonEmptyString } from './zod-helpers';

// Workspace-scoped: a document always belongs to a workspace, and every
// chat (and therefore every tool call) always has one.
//
// Every schema below is a flat top-level z.object: Anthropic's tool
// `input_schema` requires a top-level `type: "object"`, and a top-level
// union (e.g. z.discriminatedUnion) compiles to `anyOf` with no `type`,
// which the API rejects.

function toDocumentSummary(documentRecord: DocumentWithRelations) {
  return {
    id: documentRecord.id,
    title: documentRecord.title,
    folderName: documentRecord.folder?.name ?? null,
  };
}

function toErrorMessage(error: unknown, fallback: string): string {
  const foreignResource = getForeignReferenceResource(error);
  if (foreignResource !== null) {
    return `${FOREIGN_REFERENCE_RESOURCE_LABEL[foreignResource]} not found.`;
  }
  return error instanceof Error ? error.message : fallback;
}

// list_documents

const listDocumentsInputSchema = z.object({});

type ListDocumentsInput = z.infer<typeof listDocumentsInputSchema>;
type ListDocumentsOutput =
  | { documents: ReturnType<typeof toDocumentSummary>[] }
  | { error: string };

export const getListDocumentsTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  workspaceId: string,
): Tool<ListDocumentsInput, ListDocumentsOutput> =>
  tool({
    description:
      "List the documents in the current workspace, with each one's id, title, and folder name (if filed into one). Use this to find a document before reading or editing it.",
    inputSchema: listDocumentsInputSchema,
    execute: async () => {
      writer.write({ type: 'data-document', data: { action: 'list' }, transient: true });

      const { error, data: documents } = await tryCatch(
        () => getDocumentsByWorkspaceId({ workspaceId }),
        { retryOnFailure: false },
      );

      if (error !== null || !documents) {
        return { error: toErrorMessage(error, 'Failed to list documents.') };
      }

      return { documents: documents.map(toDocumentSummary) };
    },
  });

// read_document

const readDocumentInputSchema = z.object({
  documentId: z.string().describe('The id of the document to read.'),
});

type ReadDocumentInput = z.infer<typeof readDocumentInputSchema>;
type ReadDocumentOutput = { title: string; content: string } | { error: string };

export const getReadDocumentTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  workspaceId: string,
): Tool<ReadDocumentInput, ReadDocumentOutput> =>
  tool({
    description: "Read a document's title and full markdown content by its id.",
    inputSchema: readDocumentInputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-document',
        data: { action: 'read', documentId: input.documentId },
        transient: true,
      });

      const { error, data: documentRecord } = await tryCatch(
        () => getDocumentById({ documentId: input.documentId, workspaceId }),
        { retryOnFailure: false },
      );

      if (error !== null) {
        return { error: toErrorMessage(error, 'Failed to read document.') };
      }

      if (!documentRecord) {
        return { error: 'Document not found.' };
      }

      return { title: documentRecord.title, content: documentRecord.content };
    },
  });

// create_document

const createDocumentInputSchema = z.object({
  title: z.string().min(1).max(255).describe('The document title.'),
  content: z.string().describe('The document body as markdown.'),
  folderId: optionalNonEmptyString().describe(
    'Id of the folder to file this document under. Null or omit to leave it at root level.',
  ),
});

type CreateDocumentInput = z.infer<typeof createDocumentInputSchema>;
type CreateDocumentOutput = { id: string; title: string } | { error: string };

export const getCreateDocumentTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  workspaceId: string,
  agentId: string,
): Tool<CreateDocumentInput, CreateDocumentOutput> =>
  tool({
    description:
      'Create a new markdown document in the current workspace, optionally filed into an existing folder. Documents you create are marked as agent-created.',
    inputSchema: createDocumentInputSchema,
    execute: async (input) => {
      writer.write({ type: 'data-document', data: { action: 'create' }, transient: true });

      const { error, data: createdDocument } = await tryCatch(
        () =>
          createDocument({
            workspaceId,
            folderId: input.folderId,
            title: input.title,
            content: input.content,
            createdByAgentId: agentId,
          }),
        { retryOnFailure: false },
      );

      if (error !== null || !createdDocument) {
        return { error: toErrorMessage(error, 'Failed to create document.') };
      }

      return { id: createdDocument.id, title: createdDocument.title };
    },
  });

// edit_document

const editDocumentInputSchema = z.object({
  documentId: z.string().describe('The id of the document to edit.'),
  action: z
    .enum(['append', 'replace'])
    .describe(
      '`append` adds text to the end of the document. `replace` swaps existing text (use an empty `new` to delete text).',
    ),
  text: z
    .string()
    .optional()
    .describe('For `append`: the markdown text to add to the end of the document.'),
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

type EditDocumentInput = z.infer<typeof editDocumentInputSchema>;
type EditDocumentOutput = { ok: true } | { error: string };

export const getEditDocumentTool = (
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
  workspaceId: string,
): Tool<EditDocumentInput, EditDocumentOutput> =>
  tool({
    description:
      "Edit a document's markdown content. `append` adds new text to the end; `replace` edits or removes existing text.",
    inputSchema: editDocumentInputSchema,
    execute: async (input) => {
      writer.write({
        type: 'data-document',
        data: { action: 'edit', documentId: input.documentId },
        transient: true,
      });

      const { error, data: result } = await tryCatch(
        () => applyDocumentEdit({ documentId: input.documentId, workspaceId, input }),
        { retryOnFailure: false },
      );

      if (error !== null || result === null) {
        return { error: 'Failed to edit document. Please try again.' };
      }

      return result;
    },
  });

// Read-modify-write, same shape as the memory tool (memory.tool.ts): safe
// because tool calls within a turn run sequentially, so the workspace-scoped
// update below is the only last-writer-wins boundary.
async function applyDocumentEdit({
  documentId,
  workspaceId,
  input,
}: {
  documentId: string;
  workspaceId: string;
  input: EditDocumentInput;
}): Promise<EditDocumentOutput> {
  const documentRecord = await getDocumentById({ documentId, workspaceId });

  if (!documentRecord) {
    return { error: 'Document not found.' };
  }

  let edit: Edit;

  if (input.action === 'append') {
    if (!input.text) {
      return { error: '`append` requires `text`.' };
    }
    edit = appendText(documentRecord.content, input.text);
  } else {
    if (!input.old) {
      return { error: '`replace` requires `old`.' };
    }
    edit = replaceText(documentRecord.content, input.old, input.new ?? '');
  }

  if ('error' in edit) {
    return edit;
  }

  await updateDocument({ documentId, workspaceId, content: edit.content });

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
    return { error: 'Text not found in document.' };
  }

  if (occurrences > 1) {
    return {
      error: `Text appears ${occurrences} times in document. Include more surrounding context so it matches only one place.`,
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

export type ListDocumentsToolInput = InferToolInput<ReturnType<typeof getListDocumentsTool>>;
export type ListDocumentsToolOutput = InferToolOutput<ReturnType<typeof getListDocumentsTool>>;
export type ListDocumentsUiTool = InferUITool<ReturnType<typeof getListDocumentsTool>>;

export type ReadDocumentToolInput = InferToolInput<ReturnType<typeof getReadDocumentTool>>;
export type ReadDocumentToolOutput = InferToolOutput<ReturnType<typeof getReadDocumentTool>>;
export type ReadDocumentUiTool = InferUITool<ReturnType<typeof getReadDocumentTool>>;

export type CreateDocumentToolInput = InferToolInput<ReturnType<typeof getCreateDocumentTool>>;
export type CreateDocumentToolOutput = InferToolOutput<ReturnType<typeof getCreateDocumentTool>>;
export type CreateDocumentUiTool = InferUITool<ReturnType<typeof getCreateDocumentTool>>;

export type EditDocumentToolInput = InferToolInput<ReturnType<typeof getEditDocumentTool>>;
export type EditDocumentToolOutput = InferToolOutput<ReturnType<typeof getEditDocumentTool>>;
export type EditDocumentUiTool = InferUITool<ReturnType<typeof getEditDocumentTool>>;
