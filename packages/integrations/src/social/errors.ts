export type LinkedinPublishErrorKind = 'auth' | 'rate_limited' | 'image_failed' | 'rejected';

export class LinkedinPublishError extends Error {
  constructor(
    public readonly kind: LinkedinPublishErrorKind,
    message: string = kind,
  ) {
    super(message);
    this.name = 'LinkedinPublishError';
  }
}
