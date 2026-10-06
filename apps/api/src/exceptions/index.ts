import { HTTPException } from 'hono/http-exception';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';

export { HTTPException };

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

// Conflict (409) Exception
export class ConflictException extends HTTPException {
  constructor(message?: string) {
    super(StatusCodes.CONFLICT, {
      message: message || ReasonPhrases.CONFLICT,
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

// Payload Too Large (413) Exception
export class PayloadTooLargeException extends HTTPException {
  constructor(message?: string) {
    super(StatusCodes.REQUEST_TOO_LONG, {
      message: message || ReasonPhrases.REQUEST_TOO_LONG,
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
