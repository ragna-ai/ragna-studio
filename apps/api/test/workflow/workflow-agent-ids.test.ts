import { getWorkflowAgentIds, type WorkflowDefinition } from '@repo/workflow';
import { describe, expect, test } from 'bun:test';

const position = { x: 0, y: 0 };

function agentNode(id: string, agentId: string): WorkflowDefinition['nodes'][number] {
  return {
    id,
    type: 'agent',
    position,
    data: { label: 'Agent', config: { agentId, prompt: 'Do it' } },
  };
}

function teamNode(
  id: string,
  leadAgentId: string,
  memberAgentIds: string[],
): WorkflowDefinition['nodes'][number] {
  return {
    id,
    type: 'team',
    position,
    data: {
      label: 'Team',
      config: {
        mode: 'delegate',
        leadAgentId,
        prompt: '{{input}}',
        members: memberAgentIds.map((agentId) => ({ agentId, role: '' })),
      },
    },
  };
}

function definitionOf(...nodes: WorkflowDefinition['nodes']): WorkflowDefinition {
  return { nodes, edges: [] };
}

describe('getWorkflowAgentIds', () => {
  test('returns nothing for a definition without agents', () => {
    expect(getWorkflowAgentIds(definitionOf())).toEqual([]);
  });

  test('collects agent node, team lead and team members', () => {
    const definition = definitionOf(
      agentNode('a1', 'agent-1'),
      teamNode('t1', 'lead-1', ['member-1', 'member-2']),
    );

    expect(getWorkflowAgentIds(definition).sort()).toEqual([
      'agent-1',
      'lead-1',
      'member-1',
      'member-2',
    ]);
  });

  test('dedupes ids used in several places', () => {
    const definition = definitionOf(
      agentNode('a1', 'shared'),
      agentNode('a2', 'shared'),
      teamNode('t1', 'shared', ['shared', 'other']),
    );

    expect(getWorkflowAgentIds(definition).sort()).toEqual(['other', 'shared']);
  });
});
