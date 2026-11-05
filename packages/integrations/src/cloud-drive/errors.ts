export type CloudDriveErrorKind =
  | 'not_found'
  | 'read_only'
  | 'too_large'
  | 'rate_limited'
  | 'auth'
  | 'unsupported';

export class CloudDriveError extends Error {
  constructor(
    public readonly kind: CloudDriveErrorKind,
    message: string = kind,
  ) {
    super(message);
    this.name = 'CloudDriveError';
  }
}
