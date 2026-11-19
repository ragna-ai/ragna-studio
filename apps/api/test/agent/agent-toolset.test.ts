import { buildAgentToolset, type AgentToolGrant } from '@repo/ai';
import { describe, expect, test } from 'bun:test';
import * as z from 'zod';

const toolContext = { userId: 'user-1', agentId: 'agent-1', workspaceId: 'workspace-1' };

function toolNamesFor(grants: AgentToolGrant[], retrievalMode = false): string[] {
  const tools = buildAgentToolset(grants, { ...toolContext, retrievalMode });
  return Object.keys(tools).sort();
}

describe('AI SDK tool names per agent tool grant', () => {
  test.each<[AgentToolGrant, string[]]>([
    [{ id: 'think' }, ['think']],
    [{ id: 'webSearch' }, ['webSearch']],
    [{ id: 'webBrowser' }, ['webBrowser']],
    [{ id: 'imageGen' }, ['imageGen']],
    [{ id: 'videoGen' }, ['videoGen']],
    [{ id: 'linkedinDraft' }, ['linkedinDraft']],
    [{ id: 'memory' }, ['memory']],
    [
      { id: 'datasets' },
      [
        'datasetAppendRow',
        'datasetCreate',
        'datasetFind',
        'datasetGetRow',
        'datasetListRows',
        'datasetMoveRow',
        'datasetUpdateRow',
      ],
    ],
    [{ id: 'documents' }, ['createDocument', 'editDocument', 'listDocuments', 'readDocument']],
    [{ id: 'tasks' }, ['createTask', 'listTasks', 'moveTask', 'readTask', 'updateTask']],
    [
      { id: 'google-drive', access: 'read' },
      ['googleDriveListFolder', 'googleDriveReadFile', 'googleDriveSearch'],
    ],
    [
      { id: 'google-drive', access: 'write' },
      [
        'googleDriveCreateFile',
        'googleDriveListFolder',
        'googleDriveReadFile',
        'googleDriveSearch',
        'googleDriveUpdateFile',
      ],
    ],
  ])('%o gives its AI SDK tools', (grant, expectedNames) => {
    expect(toolNamesFor([grant])).toEqual(expectedNames);
  });

  test('retrieval mode adds the context search tool without a grant', () => {
    expect(toolNamesFor([], true)).toEqual(['searchContextDocuments']);
  });

  test('no grants give no tools', () => {
    expect(toolNamesFor([])).toEqual([]);
  });
});

const ALL_GRANTS: AgentToolGrant[] = [
  { id: 'think' },
  { id: 'webSearch' },
  { id: 'webBrowser' },
  { id: 'imageGen' },
  { id: 'videoGen' },
  { id: 'linkedinDraft' },
  { id: 'memory' },
  { id: 'datasets' },
  { id: 'documents' },
  { id: 'tasks' },
  { id: 'google-drive', access: 'write' },
];

/** Paths of JSON Schema objects that accept any extra key. Records constrain theirs with a value schema. */
function objectsAllowingUnknownKeys(node: unknown, path: string): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => objectsAllowingUnknownKeys(child, `${path}[${index}]`));
  }
  if (typeof node !== 'object' || node === null) return [];

  const isObject = 'type' in node && node.type === 'object';
  const extraKeys = 'additionalProperties' in node ? node.additionalProperties : true;
  const own = isObject && extraKeys === true ? [path] : [];
  const nested = Object.entries(node).flatMap(([key, child]) =>
    objectsAllowingUnknownKeys(child, `${path}.${key}`),
  );
  return own.concat(nested);
}

describe('declared tool output shapes', () => {
  const tools = buildAgentToolset(ALL_GRANTS, { ...toolContext, retrievalMode: true });

  test.each(Object.keys(tools).sort())(
    '%s rejects unknown output fields at every level',
    (name) => {
      const outputSchema = tools[name]?.outputSchema;
      if (!(outputSchema instanceof z.ZodType)) throw new Error(`${name} has no zod output schema`);

      expect(
        objectsAllowingUnknownKeys(z.toJSONSchema(outputSchema, { io: 'input' }), name),
      ).toEqual([]);
    },
  );
});
