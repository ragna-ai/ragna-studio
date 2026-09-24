import type { AttachmentItem, FileAttachment, Message } from '@microsoft/microsoft-graph-types';

export interface GraphODataCollection<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

export interface GraphDeltaPage<T> extends GraphODataCollection<T> {
  '@odata.deltaLink'?: string;
}

export type GraphRemovedReason = 'changed' | 'deleted';

export type GraphDeltaMessage = Message & { '@removed'?: { reason?: GraphRemovedReason } };

/** Names usable directly in a path like `/me/mailFolders/{name}`. */
export type GraphWellKnownFolderName = 'inbox' | 'sentitems' | 'deleteditems' | 'junkemail' | 'drafts' | 'archive';

/** A folder absent from this mailbox (e.g. no Archive) is left out. */
export type GraphWellKnownFolderIds = Partial<Record<GraphWellKnownFolderName, string>>;

export type GraphSyncedFolderName = Exclude<GraphWellKnownFolderName, 'drafts'>;

export interface GraphSyncCursor {
  v: 1;
  folders: Partial<Record<GraphSyncedFolderName, string>>;
}

export interface GraphErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

/** $select projection used for attachment metadata, deliberately excluding `contentBytes`. */
export type GraphAttachmentMetadata = Pick<FileAttachment, 'id' | 'name' | 'contentType' | 'size' | 'isInline' | 'contentId'>;

/** POST body for `/attachments`; the package's `FileAttachment` has no `@odata.type` discriminator. */
export type GraphFileAttachmentCreate = Pick<FileAttachment, 'name' | 'contentType' | 'contentBytes' | 'contentId' | 'isInline'> & {
  '@odata.type': '#microsoft.graph.fileAttachment';
};

export interface GraphCreateUploadSessionRequest {
  AttachmentItem: AttachmentItem;
}

export type GraphUploadChunkOutcome =
  | { status: 'pending'; nextRangeStart: number }
  | { status: 'completed'; attachmentId: string };
