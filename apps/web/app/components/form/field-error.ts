import type { AnyFieldApi } from '@tanstack/vue-form';

/** Errors show once the field was left or a submit was attempted, never while typing first. */
export function isFieldErrorVisible(
  field: AnyFieldApi,
  submissionAttempts: number,
): boolean {
  const { errors, isBlurred } = field.state.meta;
  return errors.length > 0 && (isBlurred || submissionAttempts > 0);
}

export function fieldMessageId(field: AnyFieldApi): string {
  return `${field.name}-message`;
}
