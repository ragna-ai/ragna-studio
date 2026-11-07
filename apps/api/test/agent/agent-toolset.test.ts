import { buildAgentToolset, type AgentToolGrant } from '@repo/ai';
import { describe, expect, test } from 'bun:test';

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
