export class MailProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'MailProviderError';
  }
}

/** Distinct from a transient 429/5xx: the token was rejected outright. */
export function isMailAuthError(error: unknown): boolean {
  return error instanceof MailProviderError && (error.status === 401 || error.status === 403);
}

export function isMailNotFoundError(error: unknown): boolean {
  return error instanceof MailProviderError && error.status === 404;
}
