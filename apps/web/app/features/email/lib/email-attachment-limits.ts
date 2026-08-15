// Mirrors apps/api/src/services/email.service.ts's MAX_TOTAL_ATTACHMENT_BYTES
// (Gmail's own send cap), so oversized attachments are flagged before a
// request is even sent.
export const EMAIL_MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
