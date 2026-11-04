import type { IntegrationId, ProviderId } from './catalog';

export class ConnectionNeedsReauthError extends Error {
  constructor(public readonly connectionId: string) {
    super(`Connection ${connectionId} needs to be reconnected`);
    this.name = 'ConnectionNeedsReauthError';
  }
}

export class ConnectionProviderMismatchError extends Error {
  constructor(
    public readonly connectionId: string,
    public readonly expectedProvider: ProviderId,
  ) {
    super(`Connection ${connectionId} is not a ${expectedProvider} connection`);
    this.name = 'ConnectionProviderMismatchError';
  }
}

export class ConnectionScopesMissingError extends Error {
  constructor(
    public readonly connectionId: string,
    public readonly integrationId: IntegrationId,
  ) {
    super(`Connection ${connectionId} lacks the scopes ${integrationId} needs`);
    this.name = 'ConnectionScopesMissingError';
  }
}

export class ConnectionIntegrationDisabledError extends Error {
  constructor(
    public readonly connectionId: string,
    public readonly integrationId: IntegrationId,
  ) {
    super(`Connection ${connectionId} has ${integrationId} turned off`);
    this.name = 'ConnectionIntegrationDisabledError';
  }
}
