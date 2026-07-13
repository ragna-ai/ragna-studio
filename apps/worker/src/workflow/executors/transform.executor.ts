import type { TransformConfig } from '@repo/workflow';
import { resolveTemplate } from '@repo/workflow';
import type { Executor } from './types';

export const executeTransform: Executor = async (node, ctx) => {
  const config = node.data.config as TransformConfig;
  return { output: resolveTemplate(config.template, ctx) };
};
