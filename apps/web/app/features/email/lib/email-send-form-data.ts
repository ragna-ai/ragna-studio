import type { SendEmailDraftVariables } from '~/features/email/types';

// Multipart body builder for POST /email/draft/:draftId/send
// (apps/api/src/controllers/email.controller.ts). Every compose flow now
// edits a draft first (docs/email/drafts-change-request.md), so this is the
// only send path left on the client - there is no more plain, non-draft
// /email/send caller.

function appendRepeated(formData: FormData, key: string, values: string[] | undefined): void {
  for (const value of values ?? []) {
    formData.append(key, value);
  }
}

export function buildSendDraftFormData(input: Omit<SendEmailDraftVariables, 'draftId'>): FormData {
  const formData = new FormData();
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
  if (input.content !== undefined) formData.append('content', input.content);
  return formData;
}
