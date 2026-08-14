import type { SendEmailDraftVariables, SendEmailVariables } from '~/features/email/types';

// Shared multipart body builder for /email/send and /email/draft/:draftId/send
// (apps/api/src/controllers/email.controller.ts: identical field shape,
// recipients and media picks as repeated form fields).

function appendRepeated(formData: FormData, key: string, values: string[] | undefined): void {
  for (const value of values ?? []) {
    formData.append(key, value);
  }
}

function appendCommonFields(
  formData: FormData,
  input: Pick<SendEmailVariables, 'to' | 'cc' | 'bcc' | 'subject' | 'html' | 'text' | 'mediaIds' | 'files'>,
): void {
  appendRepeated(formData, 'to', input.to);
  appendRepeated(formData, 'cc', input.cc);
  appendRepeated(formData, 'bcc', input.bcc);
  formData.append('subject', input.subject);
  formData.append('html', input.html);
  formData.append('text', input.text);
  appendRepeated(formData, 'mediaId', input.mediaIds);
  for (const file of input.files ?? []) {
    formData.append('files', file);
  }
}

export function buildSendFormData(input: SendEmailVariables): FormData {
  const formData = new FormData();
  appendCommonFields(formData, input);
  if (input.threadId) formData.append('threadId', input.threadId);
  if (input.replyToMessageId) formData.append('replyToMessageId', input.replyToMessageId);
  if (input.draftId) formData.append('draftId', input.draftId);
  return formData;
}

export function buildSendDraftFormData(input: Omit<SendEmailDraftVariables, 'draftId'>): FormData {
  const formData = new FormData();
  appendCommonFields(formData, input);
  if (input.content !== undefined) formData.append('content', input.content);
  return formData;
}
