<script setup lang="ts">
import {
  FileTextIcon,
  FolderIcon,
  FolderInputIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from '@lucide/vue';
import type { Document, Folder } from '~/features/document/types';

export interface MoveDocumentPayload {
  documentId: string;
  folderId: string | null;
}

// Props
interface Props {
  documents: Document[];
  /** Folder rows shown above the documents (top level only). */
  folderRows: Folder[];
  /** Targets offered by the "Move to folder" menu. */
  moveTargets: Folder[];
}
defineProps<Props>();

// Emits
interface Emits {
  'open-folder': [folderId: string];
  'rename-folder': [folder: Folder];
  'delete-folder': [folder: Folder];
  'delete-document': [documentId: string];
  'move-document': [payload: MoveDocumentPayload];
}
const emit = defineEmits<Emits>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Functions
function authorName(document: Document): string {
  return (
    document.createdByAgentName ??
    document.createdByUserName ??
    t('organization.formerMember')
  );
}
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead class="w-12">&nbsp;</TableHead>
        <TableHead>{{ t('common.name') }}</TableHead>
        <TableHead>{{ t('document.list.table.author') }}</TableHead>
        <TableHead>{{ t('common.updated') }}</TableHead>
        <TableHead class="text-right">{{ t('common.actions') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow
        v-for="folder in folderRows"
        :key="folder.id"
        class="cursor-pointer"
        @click="emit('open-folder', folder.id)"
      >
        <TableCell class="w-12">
          <FolderIcon class="size-4 stroke-1.5" />
        </TableCell>
        <TableCell>
          <span class="text-sm font-semibold">{{ folder.name }}</span>
          <span class="ml-2 text-xs text-muted-foreground">{{
            folder.documentCount
          }}</span>
        </TableCell>
        <TableCell />
        <TableCell class="whitespace-nowrap">{{
          formatDateTime(folder.updatedAt)
        }}</TableCell>
        <TableCell class="text-right whitespace-nowrap" @click.stop>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                :aria-label="t('folder.actions', { name: folder.name })"
              >
                <MoreVerticalIcon class="size-4 stroke-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent size="sm" align="end">
              <DropdownMenuItem @click="emit('rename-folder', folder)">
                <PencilIcon class="stroke-1.5" />
                {{ t('folder.rename') }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="emit('delete-folder', folder)"
              >
                <Trash2Icon class="stroke-1.5" />
                {{ t('folder.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <TableRow
        v-for="document in documents"
        :key="document.id"
        class="cursor-pointer"
        @click="navigateTo(`/document/${document.id}`)"
      >
        <TableCell class="w-12">
          <FileTextIcon class="size-4 stroke-1.5" />
        </TableCell>
        <TableCell>
          <span class="text-sm font-semibold">{{ document.title }}</span>
        </TableCell>
        <TableCell class="text-sm whitespace-nowrap">{{
          authorName(document)
        }}</TableCell>
        <TableCell class="whitespace-nowrap">{{
          formatDateTime(document.updatedAt)
        }}</TableCell>
        <TableCell class="text-right whitespace-nowrap" @click.stop>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                :aria-label="
                  t('document.list.item.actions', { title: document.title })
                "
              >
                <MoreVerticalIcon class="size-4 stroke-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent size="sm" align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInputIcon class="stroke-1.5" />
                  {{ t('document.list.item.moveToFolder') }}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    :disabled="document.folderId === null"
                    @click="
                      emit('move-document', {
                        documentId: document.id,
                        folderId: null,
                      })
                    "
                  >
                    {{ t('document.list.noFolder') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    v-for="target in moveTargets"
                    :key="target.id"
                    :disabled="document.folderId === target.id"
                    @click="
                      emit('move-document', {
                        documentId: document.id,
                        folderId: target.id,
                      })
                    "
                  >
                    {{ target.name }}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="emit('delete-document', document.id)"
              >
                <Trash2Icon class="stroke-1.5" />
                {{ t('document.list.item.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
