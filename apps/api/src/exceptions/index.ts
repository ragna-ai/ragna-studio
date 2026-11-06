import type { ProblemError } from '@repo/api-errors';
import type { WorkflowGraphIssue } from '@repo/workflow';
import { HTTPException } from 'hono/http-exception';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import { ProblemException } from './problem-details';

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

// Payment Required (402) while the caller's organization has no credits left
export class OutOfCreditsException extends ProblemException {
  constructor(message?: string) {
    super(StatusCodes.PAYMENT_REQUIRED, { type: 'out-of-credits', message });
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

// Forbidden (403) while the caller's organization is soft-deleted
export class OrganizationDeletedException extends ProblemException {
  constructor() {
    super(StatusCodes.FORBIDDEN, {
      type: 'organization-deleted',
      message: 'This organization is scheduled for deletion.',
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

// Unprocessable Entity (422) for request input that fails schema validation
export class ValidationException extends ProblemException {
  constructor(message: string, errors: ProblemError[]) {
    super(StatusCodes.UNPROCESSABLE_ENTITY, { type: 'validation', message, errors });
  }
}

// Bad Request (400) for a workflow definition that fails graph validation
export class WorkflowInvalidException extends ProblemException {
  constructor(issues: WorkflowGraphIssue[]) {
    super(StatusCodes.BAD_REQUEST, {
      type: 'workflow-invalid',
      message: 'Workflow definition is invalid',
      errors: issues.map((issue) => ({ rule: issue.code, detail: issue.message })),
    });
  }
}

// Conflict (409) carrying the thread's existing draft
export class EmailDraftExistsException extends ProblemException {
  constructor(draft: unknown) {
    super(StatusCodes.CONFLICT, {
      type: 'email-draft-exists',
      message: 'Thread already has an active draft',
      draft,
    });
  }
}

// Bad Request (400) when publishing without a connected LinkedIn account
export class LinkedinNotConnectedException extends ProblemException {
  constructor() {
    super(StatusCodes.BAD_REQUEST, {
      type: 'linkedin-not-connected',
      message: 'No LinkedIn account connected',
    });
  }
}
