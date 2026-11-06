import * as z from 'zod';

export const problemTypeSchema = z.enum([
  'validation',
  'out-of-credits',
  'organization-deleted',
  'linkedin-not-connected',
  'workflow-invalid',
  'email-draft-exists',
]);

export type ProblemType = z.infer<typeof problemTypeSchema>;

export const PROBLEM_TITLES: Record<ProblemType, string> = {
  validation: 'Validation failed',
  'out-of-credits': 'Out of credits',
  'organization-deleted': 'Organization scheduled for deletion',
  'linkedin-not-connected': 'LinkedIn not connected',
  'workflow-invalid': 'Workflow is invalid',
  'email-draft-exists': 'Email draft already exists',
};

export const ABOUT_BLANK = 'about:blank';
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const PROBLEM_TYPE_URI_PREFIX = 'https://docs.ragna.io/errors/';

export function problemTypeUri(type: ProblemType): string {
  return `${PROBLEM_TYPE_URI_PREFIX}${type}`;
}

export function problemTypeFromUri(uri: string): ProblemType | null {
  if (!uri.startsWith(PROBLEM_TYPE_URI_PREFIX)) return null;
  const parsed = problemTypeSchema.safeParse(uri.slice(PROBLEM_TYPE_URI_PREFIX.length));
  return parsed.success ? parsed.data : null;
}
