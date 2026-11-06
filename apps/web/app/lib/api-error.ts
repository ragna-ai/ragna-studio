import {
  ABOUT_BLANK,
  problemDetailsSchema,
  problemTypeFromUri,
  workflowRuleSchema,
  type ProblemDetails,
  type ProblemType,
  type WorkflowRule,
} from '@repo/api-errors';
import type enUK from '../../i18n/locales/en-UK.json';

type JsonKeyPaths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : `${K}.${JsonKeyPaths<T[K]>}`;
}[keyof T & string];

/** Every dotted key path of the English locale file, e.g. `credit.outOfCredits`. */
export type MessageKey = JsonKeyPaths<typeof enUK>;

export const PROBLEM_MESSAGE_KEYS: Record<ProblemType, MessageKey> = {
  validation: 'problem.type.validation',
  'out-of-credits': 'credit.outOfCredits',
  'organization-deleted': 'problem.type.organizationDeleted',
  'linkedin-not-connected': 'social.toast.linkedinNotConnected',
  'workflow-invalid': 'problem.type.workflowInvalid',
  'email-draft-exists': 'problem.type.emailDraftExists',
};

export const WORKFLOW_RULE_MESSAGE_KEYS: Record<WorkflowRule, MessageKey> = {
  triggerCount: 'problem.workflowRule.triggerCount',
  unknownEdgeNode: 'problem.workflowRule.unknownEdgeNode',
  conditionHandle: 'problem.workflowRule.conditionHandle',
  cycle: 'problem.workflowRule.cycle',
};

interface ErrorWithData {
  data?: unknown;
}

/**
 * Reads the problem body off an ofetch error or a `ChatStreamError`, both
 * of which carry it on `data`. Returns null for anything else (a proxy
 * page, a network failure).
 */
export function parseProblem(error: unknown): ProblemDetails | null {
  if (typeof error !== 'object' || error === null) return null;
  const { data }: ErrorWithData = error;
  const parsed = problemDetailsSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * The known problem type of an error, or null (unknown types behave like
 * `about:blank`). A failed chat stream carries only the type URI as the
 * error message, so that is read too.
 */
export function getProblemType(error: unknown): ProblemType | null {
  const problem = parseProblem(error);
  if (problem) return problemTypeFromUri(problem.type);
  if (error instanceof Error && error.message !== ABOUT_BLANK) {
    return problemTypeFromUri(error.message);
  }
  return null;
}

function translateWorkflowRules(problem: ProblemDetails): string | null {
  const { t } = useNuxtApp().$i18n;
  const messages = new Set<string>();
  for (const { rule } of problem.errors ?? []) {
    const parsedRule = workflowRuleSchema.safeParse(rule);
    if (!parsedRule.success) continue;
    messages.add(t(WORKFLOW_RULE_MESSAGE_KEYS[parsedRule.data]));
  }
  return messages.size > 0 ? [...messages].join(' ') : null;
}

/**
 * Turns a failed request or chat stream into a user-facing message: the
 * translated message of its problem type, or `fallback` for unknown types,
 * server errors and anything that is not a problem body.
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  const type = getProblemType(error);
  if (!type) return fallback;
  const problem = parseProblem(error);
  if (problem && problem.status >= 500) return fallback;
  if (type === 'workflow-invalid' && problem) {
    const ruleMessages = translateWorkflowRules(problem);
    if (ruleMessages) return ruleMessages;
  }
  return useNuxtApp().$i18n.t(PROBLEM_MESSAGE_KEYS[type]);
}

/** True for an ofetch error whose HTTP status is 404. */
export function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 404
  );
}
