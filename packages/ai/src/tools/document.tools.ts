import type { DocumentWithRelations } from '@repo/database';
import {
  createDocument,
  getDocumentById,
  getDocumentsByWorkspaceId,
  updateDocument,
} from '@repo/database';
import * as z from 'zod';
import { failOnForeignReference } from './foreign-reference-failure';
import type { ToolDefinition, ToolFailure } from './tool-definition';
import { optionalNonEmptyString } from './zod-helpers';

// Workspace-scoped: a document always belongs to a workspace, and every
// chat (and therefore every tool call) always has one.
//
// Every schema below is a flat top-level z.object: Anthropic's tool
// `input_schema` requires a top-level `type: "object"`, and a top-level
// union (e.g. z.discriminatedUnion) compiles to `anyOf` with no `type`,
// which the API rejects.

export interface DocumentToolDefinitionsOptions {
  /** Marks the documents the create tool makes as agent-created. */
  agentId: string;
}

interface DocumentSummary {
  id: string;
  title: string;
  folderName: string | null;
}

function toDocumentSummary(documentRecord: DocumentWithRelations): DocumentSummary {
  return {
    id: documentRecord.id,
    title: documentRecord.title,
    folderName: documentRecord.folder?.name ?? null,
  };
}

const DOCUMENT_NOT_FOUND: ToolFailure<'not_found'> = {
  status: 'not_found',
  message: 'Document not found.',
};

// list_documents

const listDocumentsInputSchema = z.object({});

interface ListDocumentsOutput {
  documents: DocumentSummary[];
}

const listDocumentsDefinition: ToolDefinition<
  typeof listDocumentsInputSchema,
  ListDocumentsOutput
> = {
  name: 'listDocuments',
  description:
    "List the documents in the current workspace, with each one's id, title, and folder name (if filed into one). Use this to find a document before reading or editing it.",
  inputSchema: listDocumentsInputSchema,
  access: 'read',
  execute: async (_input, { workspaceId }) => {
    const documents = await getDocumentsByWorkspaceId({
      workspaceId,
      folderFilter: { kind: 'all' },
    });
    return { documents: documents.map(toDocumentSummary) };
  },
};

// read_document

const readDocumentInputSchema = z.object({
  documentId: z.string().describe('The id of the document to read.'),
});

interface ReadDocumentOutput {
  title: string;
  content: string;
}

const readDocumentDefinition: ToolDefinition<
  typeof readDocumentInputSchema,
  ReadDocumentOutput | ToolFailure<'not_found'>
> = {
  name: 'readDocument',
  description: "Read a document's title and full markdown content by its id.",
  inputSchema: readDocumentInputSchema,
  access: 'read',
  execute: async ({ documentId }, { workspaceId }) => {
    const documentRecord = await getDocumentById({ documentId, workspaceId });
    if (!documentRecord) {
      return DOCUMENT_NOT_FOUND;
    }
    return { title: documentRecord.title, content: documentRecord.content };
  },
};

// create_document

const createDocumentInputSchema = z.object({
  title: z.string().min(1).max(255).describe('The document title.'),
  content: z.string().describe('The document body as markdown.'),
  folderId: optionalNonEmptyString().describe(
    'Id of the folder to file this document under. Null or omit to leave it at root level.',
  ),
});

interface CreateDocumentOutput {
  id: string;
  title: string;
}

function createDocumentDefinition({
  agentId,
}: DocumentToolDefinitionsOptions): ToolDefinition<
  typeof createDocumentInputSchema,
  CreateDocumentOutput | ToolFailure<'not_found'>
> {
  return {
    name: 'createDocument',
    description:
      'Create a new markdown document in the current workspace, optionally filed into an existing folder. Documents you create are marked as agent-created.',
    inputSchema: createDocumentInputSchema,
    access: 'write',
    execute: ({ title, content, folderId }, { workspaceId }) =>
      failOnForeignReference(async () => {
        const createdDocument = await createDocument({
          workspaceId,
          folderId,
          title,
          content,
          createdByAgentId: agentId,
        });
        return { id: createdDocument.id, title: createdDocument.title };
      }),
  };
}

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

type EditDocumentFailure = ToolFailure<'not_found' | 'invalid_input' | 'ambiguous_match'>;
type EditDocumentOutput = { ok: true } | EditDocumentFailure;
type TextEdit = { content: string } | EditDocumentFailure;

function appendText(content: string, text: string): TextEdit {
  return { content: content.length === 0 ? text : `${content}\n\n${text}` };
}

// Requires a unique match, the same guard the Anthropic `str_replace` memory
// tool uses: it forces the model to quote enough context to be unambiguous.
function replaceText(content: string, oldText: string, newText: string): TextEdit {
  const occurrences = countOccurrences(content, oldText);

  if (occurrences === 0) {
    return { status: 'not_found', message: 'Text not found in document.' };
  }

  if (occurrences > 1) {
    return {
      status: 'ambiguous_match',
      message: `Text appears ${occurrences} times in document. Include more surrounding context so it matches only one place.`,
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

function applyEdit(content: string, input: z.infer<typeof editDocumentInputSchema>): TextEdit {
  if (input.action === 'append') {
    if (!input.text) {
      return { status: 'invalid_input', message: '`append` requires `text`.' };
    }
    return appendText(content, input.text);
  }

  if (!input.old) {
    return { status: 'invalid_input', message: '`replace` requires `old`.' };
  }
  return replaceText(content, input.old, input.new ?? '');
}

// Read-modify-write, same shape as the memory tool (memory.tool.ts): safe
// because tool calls within a turn run sequentially, so the workspace-scoped
// update below is the only last-writer-wins boundary.
const editDocumentDefinition: ToolDefinition<typeof editDocumentInputSchema, EditDocumentOutput> = {
  name: 'editDocument',
  description:
    "Edit a document's markdown content. `append` adds new text to the end; `replace` edits or removes existing text.",
  inputSchema: editDocumentInputSchema,
  access: 'write',
  execute: async (input, { workspaceId }) => {
    const { documentId } = input;
    const documentRecord = await getDocumentById({ documentId, workspaceId });
    if (!documentRecord) {
      return DOCUMENT_NOT_FOUND;
    }

    const edit = applyEdit(documentRecord.content, input);
    if ('status' in edit) {
      return edit;
    }

    const updatedDocument = await updateDocument({
      documentId,
      workspaceId,
      content: edit.content,
    });
    if (!updatedDocument) {
      return DOCUMENT_NOT_FOUND;
    }
    return { ok: true };
  },
};

/** The document tools of one agent. */
export function documentToolDefinitions(
  options: DocumentToolDefinitionsOptions,
): ToolDefinition<z.ZodObject, unknown>[] {
  return [
    listDocumentsDefinition,
    readDocumentDefinition,
    createDocumentDefinition(options),
    editDocumentDefinition,
  ];
}
