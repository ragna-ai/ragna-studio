import type { WorkflowNodeType } from '@repo/workflow';
import { executeAgent } from './agent.executor';
import { executeCondition } from './condition.executor';
import { executeTeam } from './team.executor';
import { executeTool } from './tool.executor';
import { executeTransform } from './transform.executor';
import { executeTrigger } from './trigger.executor';
import type { Executor } from './types';

export const nodeExecutors: Record<WorkflowNodeType, Executor> = {
  trigger: executeTrigger,
  agent: executeAgent,
  tool: executeTool,
  condition: executeCondition,
  transform: executeTransform,
  team: executeTeam,
};

export type { Executor, ExecutorContext, ExecutorResult } from './types';
