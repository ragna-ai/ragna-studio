import * as z from 'zod';

/** Zod v4 issue codes, sent as `rule` on `validation` errors. */
export const validationRuleSchema = z.enum([
  'invalid_type',
  'too_big',
  'too_small',
  'invalid_format',
  'not_multiple_of',
  'unrecognized_keys',
  'invalid_union',
  'invalid_key',
  'invalid_element',
  'invalid_value',
  'custom',
]);

export type ValidationRule = z.infer<typeof validationRuleSchema>;

/** Workflow graph issue codes, sent as `rule` on `workflow-invalid` errors. */
export const workflowRuleSchema = z.enum([
  'triggerCount',
  'unknownEdgeNode',
  'conditionHandle',
  'cycle',
]);

export type WorkflowRule = z.infer<typeof workflowRuleSchema>;
