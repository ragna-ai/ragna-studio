import { getWorkflowAgentIds, type WorkflowDefinition } from '@repo/workflow';
import { describe, expect, test } from 'bun:test';

const position = { x: 0, y: 0 };

function agentNode(id: string, agentId?: string): WorkflowDefinition['nodes'][number] {
  return {
    id,
    type: 'agent',
    position,
    data: { label: 'Agent', config: { agentId, prompt: 'Do it' } },
  };
}

function teamNode(
  id: string,
  memberAgentIds: string[],
  leadAgentId?: string,
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

  test('skips an agent node with no agent set', () => {
    expect(getWorkflowAgentIds(definitionOf(agentNode('a1')))).toEqual([]);
  });

  test('collects agent node, team lead and team members', () => {
    const definition = definitionOf(
      agentNode('a1', 'agent-1'),
      teamNode('t1', ['member-1', 'member-2'], 'lead-1'),
    );

    expect(getWorkflowAgentIds(definition).sort()).toEqual([
      'agent-1',
      'lead-1',
      'member-1',
      'member-2',
    ]);
  });

  test('skips an unset team lead', () => {
    expect(getWorkflowAgentIds(definitionOf(teamNode('t1', ['member-1'])))).toEqual(['member-1']);
  });

  test('dedupes ids used in several places', () => {
    const definition = definitionOf(
      agentNode('a1', 'shared'),
      agentNode('a2', 'shared'),
      teamNode('t1', ['shared', 'other'], 'shared'),
    );

    expect(getWorkflowAgentIds(definition).sort()).toEqual(['other', 'shared']);
  });
});
