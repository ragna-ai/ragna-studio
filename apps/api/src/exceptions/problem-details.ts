import {
  ABOUT_BLANK,
  PROBLEM_CONTENT_TYPE,
  PROBLEM_TITLES,
  problemTypeUri,
  workflowRuleSchema,
  type ProblemDetails,
  type ProblemError,
  type ProblemType,
} from '@repo/api-errors';
import type { WorkflowGraphIssueCode } from '@repo/workflow';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { getReasonPhrase } from 'http-status-codes';

// Fails check-types when the workflow validator gains a code the rule enum lacks.
type WorkflowRuleCoversAllIssueCodes =
  WorkflowGraphIssueCode extends (typeof workflowRuleSchema.options)[number] ? true : never;
export const workflowRuleCoversAllIssueCodes: WorkflowRuleCoversAllIssueCodes = true;

export interface ProblemExceptionOptions {
  type?: ProblemType;
  message?: string;
  errors?: ProblemError[];
  draft?: unknown;
}

export class ProblemException extends HTTPException {
  readonly type: ProblemType | undefined;
  readonly errors: ProblemError[] | undefined;
  readonly draft: unknown;

  constructor(status: ContentfulStatusCode, options: ProblemExceptionOptions = {}) {
    super(status, { message: options.message ?? getReasonPhrase(status) });
    this.type = options.type;
    this.errors = options.errors;
    this.draft = options.draft;
  }
}

export function toProblemDetails(err: unknown): ProblemDetails {
  if (err instanceof ProblemException) {
    return {
      type: err.type ? problemTypeUri(err.type) : ABOUT_BLANK,
      title: err.type ? PROBLEM_TITLES[err.type] : getReasonPhrase(err.status),
      status: err.status,
      detail: err.message,
      ...(err.errors && { errors: err.errors }),
      ...(err.draft !== undefined && { draft: err.draft }),
    };
  }

  if (err instanceof HTTPException) {
    return {
      type: ABOUT_BLANK,
      title: getReasonPhrase(err.status),
      status: err.status,
      detail: err.message,
    };
  }

  return {
    type: ABOUT_BLANK,
    title: getReasonPhrase(500),
    status: 500,
  };
}

export const ORGANIZATION_DELETED_CODE = 'ORGANIZATION_DELETED';

export interface DeprecatedErrorFields {
  code: number | typeof ORGANIZATION_DELETED_CODE;
  error: string;
}

/** Legacy `code`/`error` members, kept for one release next to the problem fields. */
export function withDeprecatedFields(
  problem: ProblemDetails,
): ProblemDetails & DeprecatedErrorFields {
  const isOrganizationDeleted = problem.type === problemTypeUri('organization-deleted');
  return {
    ...problem,
    code: isOrganizationDeleted ? ORGANIZATION_DELETED_CODE : problem.status,
    error: problem.detail ?? problem.title,
  };
}

export function toProblemResponse(err: unknown): Response {
  const problem = toProblemDetails(err);
  const body = withDeprecatedFields(problem);

  return new Response(JSON.stringify(body), {
    status: problem.status,
    headers: { 'Content-Type': PROBLEM_CONTENT_TYPE, 'Content-Language': 'en' },
  });
}
