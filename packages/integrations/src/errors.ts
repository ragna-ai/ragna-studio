export class ConnectionNeedsReauthError extends Error {
  constructor(public readonly connectionId: string) {
    super(`Connection ${connectionId} needs to be reconnected`);
    this.name = 'ConnectionNeedsReauthError';
  }
}
