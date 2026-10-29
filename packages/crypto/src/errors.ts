export class AppKeyMissingError extends Error {
  constructor() {
    super('APP_KEY is not set');
    this.name = 'AppKeyMissingError';
  }
}

export class InvalidAppKeyError extends Error {
  constructor() {
    super('APP_KEY must be "base64:" followed by 32 random bytes');
    this.name = 'InvalidAppKeyError';
  }
}

export class UndecryptableSecretError extends Error {
  constructor() {
    super('No configured key can decrypt this secret');
    this.name = 'UndecryptableSecretError';
  }
}
