import type { ConditionConfig } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import type { Executor } from './types';

// String-only comparator, no expression parser. The engine reads the
// returned 'true'/'false' to pick which outgoing sourceHandle delivers.
function applyOperator(left: string, operator: ConditionConfig['operator'], right: string): boolean {
  switch (operator) {
    case 'equals':
      return left === right;
    case 'notEquals':
      return left !== right;
    case 'contains':
      return left.includes(right);
    case 'isEmpty':
      return left.trim().length === 0;
    case 'isNotEmpty':
      return left.trim().length > 0;
  }
}

export const executeCondition: Executor = async (node, ctx) => {
  const config = node.data.config as ConditionConfig;
  const left = resolveTemplate(config.left, ctx);
  const right = config.right !== undefined ? resolveTemplate(config.right, ctx) : '';

  return { output: applyOperator(left, config.operator, right) ? 'true' : 'false' };
};
