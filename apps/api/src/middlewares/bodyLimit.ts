import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { PayloadTooLargeException } from '../exceptions';

const MB = 1024 * 1024;

/** Max files accepted by one multi-file upload request. */
export const MAX_FILES_PER_UPLOAD_REQUEST = 5;

// Per-file cap is 10 MB; the extra MB covers multipart overhead.
const SINGLE_UPLOAD_BODY_LIMIT_BYTES = 11 * MB;
const MULTI_UPLOAD_BODY_LIMIT_BYTES = 51 * MB;
// Provider attachment cap is 25 MB (MAX_TOTAL_ATTACHMENT_BYTES in email.service.ts).
const EMAIL_SEND_BODY_LIMIT_BYTES = 26 * MB;

/** Bun's hard ceiling, and the only cap on routes without their own limit. */
export const MAX_REQUEST_BODY_BYTES = MULTI_UPLOAD_BODY_LIMIT_BYTES;

function createBodyLimit(maxSize: number): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: () => {
      throw new PayloadTooLargeException(`Request body exceeds ${maxSize / MB} MB`);
    },
  });
}

export const singleUploadBodyLimit = createBodyLimit(SINGLE_UPLOAD_BODY_LIMIT_BYTES);
export const multiUploadBodyLimit = createBodyLimit(MULTI_UPLOAD_BODY_LIMIT_BYTES);
export const emailSendBodyLimit = createBodyLimit(EMAIL_SEND_BODY_LIMIT_BYTES);
