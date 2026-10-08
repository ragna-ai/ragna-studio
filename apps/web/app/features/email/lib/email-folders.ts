import { ArchiveIcon, InboxIcon, SendIcon, StarIcon, Trash2Icon } from '@lucide/vue';
import type { Component } from 'vue';
import type { EmailFolder } from '~/features/email/types';

export interface EmailFolderConfig {
  id: EmailFolder;
  icon: Component;
  labelKey: string;
}

// Order drives the sidebar's system-folder list.
export const EMAIL_FOLDERS: EmailFolderConfig[] = [
  { id: 'inbox', icon: InboxIcon, labelKey: 'email.folder.inbox' },
  { id: 'starred', icon: StarIcon, labelKey: 'email.folder.starred' },
  { id: 'sent', icon: SendIcon, labelKey: 'email.folder.sent' },
  { id: 'archived', icon: ArchiveIcon, labelKey: 'email.folder.archived' },
  { id: 'trashed', icon: Trash2Icon, labelKey: 'email.folder.trashed' },
];
