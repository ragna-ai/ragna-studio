import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { PayloadTooLargeException } from '../exceptions';

const MB = 1024 * 1024;

/** Max files accepted by one multi-file upload request. */
export const MAX_FILES_PER_UPLOAD_REQUEST = 5;

export const DEFAULT_BODY_LIMIT_BYTES = 5 * MB;
// Per-file cap is 10 MB; the extra MB covers multipart overhead.
const SINGLE_UPLOAD_BODY_LIMIT_BYTES = 11 * MB;
const MULTI_UPLOAD_BODY_LIMIT_BYTES = 51 * MB;
// Provider attachment cap is 25 MB (MAX_TOTAL_ATTACHMENT_BYTES in email.service.ts).
const EMAIL_SEND_BODY_LIMIT_BYTES = 26 * MB;

/** Bun's hard ceiling must admit the largest route limit. */
export const MAX_REQUEST_BODY_BYTES = MULTI_UPLOAD_BODY_LIMIT_BYTES;

interface BodyLimitRule {
  method: string;
  path: RegExp;
  limit: MiddlewareHandler;
}

function createBodyLimit(maxSize: number): MiddlewareHandler {
  return bodyLimit({
    maxSize,
    onError: () => {
      throw new PayloadTooLargeException(`Request body exceeds ${maxSize / MB} MB`);
    },
  });
}

const defaultBodyLimit = createBodyLimit(DEFAULT_BODY_LIMIT_BYTES);
const singleUploadBodyLimit = createBodyLimit(SINGLE_UPLOAD_BODY_LIMIT_BYTES);
const multiUploadBodyLimit = createBodyLimit(MULTI_UPLOAD_BODY_LIMIT_BYTES);
const emailSendBodyLimit = createBodyLimit(EMAIL_SEND_BODY_LIMIT_BYTES);

const WORKSPACE_PATH = '^/workspace/[^/]+';

const bodyLimitRules: readonly BodyLimitRule[] = [
  { method: 'POST', path: new RegExp(`${WORKSPACE_PATH}/gen-image/reference-upload$`), limit: singleUploadBodyLimit },
  { method: 'POST', path: new RegExp(`${WORKSPACE_PATH}/gen-video/frame-upload$`), limit: singleUploadBodyLimit },
  { method: 'POST', path: new RegExp(`${WORKSPACE_PATH}/social-post/[^/]+/media$`), limit: singleUploadBodyLimit },
  {
    method: 'PUT',
    path: new RegExp(`${WORKSPACE_PATH}/agent/[^/]+/context-document/[^/]+/file$`),
    limit: singleUploadBodyLimit,
  },
  { method: 'POST', path: new RegExp(`${WORKSPACE_PATH}/chat/[^/]+/attachments$`), limit: multiUploadBodyLimit },
  { method: 'POST', path: new RegExp(`${WORKSPACE_PATH}/task/[^/]+/attachments$`), limit: multiUploadBodyLimit },
  {
    method: 'POST',
    path: new RegExp(`${WORKSPACE_PATH}/agent/[^/]+/context-document$`),
    limit: multiUploadBodyLimit,
  },
  { method: 'POST', path: /^\/email\/send$/, limit: emailSendBodyLimit },
  { method: 'POST', path: /^\/email\/draft\/[^/]+\/send$/, limit: emailSendBodyLimit },
];

/**
 * Mounted once, globally. Picks exactly one limit per request: the matching
 * upload/email rule, else the default. A global fixed limit would reject
 * uploads before a larger route-level limit could apply.
 */
export const requestBodyLimit = createMiddleware(async (c, next) => {
  const rule = bodyLimitRules.find(
    ({ method, path }) => method === c.req.method && path.test(c.req.path),
  );
  return (rule?.limit ?? defaultBodyLimit)(c, next);
});
