// packages/mail/src/provider/gmail/gmail.types.ts
//
// Gmail REST API v1 wire shapes (users.messages/threads/history/labels).
// Internal to the gmail/ folder; nothing here is exported from the package.
// https://developers.google.com/gmail/api/reference/rest

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePartBody {
  size?: number;
  data?: string;
  attachmentId?: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailMessagePartBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessageResource {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

export interface GmailThreadResource {
  id: string;
  historyId?: string;
  messages: GmailMessageResource[];
}

export interface GmailHistoryMessageStub {
  id: string;
  threadId: string;
  labelIds?: string[];
}

export interface GmailHistoryMessageAdded {
  message: GmailHistoryMessageStub;
}

export interface GmailHistoryMessageDeleted {
  message: GmailHistoryMessageStub;
}

export interface GmailHistoryLabelChanged {
  message: GmailHistoryMessageStub;
}

export interface GmailHistoryRecord {
  id: string;
  messagesAdded?: GmailHistoryMessageAdded[];
  messagesDeleted?: GmailHistoryMessageDeleted[];
  labelsAdded?: GmailHistoryLabelChanged[];
  labelsRemoved?: GmailHistoryLabelChanged[];
}

export interface GmailHistoryListResponse {
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId?: string;
}

export interface GmailLabelResource {
  id: string;
  name: string;
  type?: 'system' | 'user';
}

export interface GmailLabelsListResponse {
  labels?: GmailLabelResource[];
}

export interface GmailThreadStub {
  id: string;
  snippet?: string;
  historyId?: string;
}

export interface GmailThreadsListResponse {
  threads?: GmailThreadStub[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GmailAttachmentResource {
  attachmentId?: string;
  size: number;
  data: string;
}

export interface GmailProfileResource {
  emailAddress: string;
  historyId: string;
  messagesTotal?: number;
  threadsTotal?: number;
}

export interface GmailMessageSendResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
}
