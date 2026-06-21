import { ReasonPhrases, StatusCodes } from 'http-status-codes';

export class HTTPException extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, options?: { message?: string }) {
    super(options?.message ?? 'HTTP Exception');
    this.statusCode = statusCode;
    this.name = 'HTTPException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Unauthorized (401) Exception
export class UnauthorizedException extends HTTPException {
  constructor(message?: string) {
    super(StatusCodes.UNAUTHORIZED, {
      message: message || ReasonPhrases.UNAUTHORIZED,
    });
  }
}

// Bad Request (400) Exception
export class BadRequestException extends HTTPException {
  constructor(message?: string) {
    super(StatusCodes.BAD_REQUEST, {
      message: message || ReasonPhrases.BAD_REQUEST,
    });
  }
}

// Payment Required (402) Exception
export class PaymentRequiredException extends HTTPException {
  constructor(message?: string) {
    super(StatusCodes.PAYMENT_REQUIRED, {
      message: message || ReasonPhrases.PAYMENT_REQUIRED,
    });
  }
}

// Forbidden (403) Exception
export class ForbiddenException extends HTTPException {
  constructor(message?: string) {
    super(StatusCodes.FORBIDDEN, {
      message: message || ReasonPhrases.FORBIDDEN,
    });
  }
}

// Not Found (404) Exception
export class NotFoundException extends HTTPException {
  constructor(message?: string) {
    super(StatusCodes.NOT_FOUND, {
      message: message || ReasonPhrases.NOT_FOUND,
    });
  }
}

// Unprocessable Entity (422) Exception
export class UnprocessableEntityException extends HTTPException {
  constructor(message?: string) {
    super(StatusCodes.UNPROCESSABLE_ENTITY, {
      message: message || ReasonPhrases.UNPROCESSABLE_ENTITY,
    });
  }
}

// Internal Server Error (500) Exception
export class InternalServerErrorException extends HTTPException {
  constructor(message?: string) {
    super(StatusCodes.INTERNAL_SERVER_ERROR, {
      message: message || ReasonPhrases.INTERNAL_SERVER_ERROR,
    });
  }
}
