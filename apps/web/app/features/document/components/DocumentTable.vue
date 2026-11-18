<script setup lang="ts">
import DocumentMoveSubmenu from '~/features/document/components/DocumentMoveSubmenu.vue';
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
  isLoading: boolean;
}
defineProps<Props>();

// Emits
interface Emits {
  'open-folder': [folderId: string];
  'rename-folder': [folder: Folder];
  'rename-document': [document: Document];
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

function documentPath(document: Document): string {
  return `/document/${document.id}`;
}
</script>

<template>
  <ListTable>
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead>{{ t('common.name') }}</TableHead>
        <TableHead class="w-45">{{
          t('document.list.table.author')
        }}</TableHead>
        <TableHead class="w-45">{{ t('common.updated') }}</TableHead>
        <TableHead class="w-10">
          <span class="sr-only">{{ t('common.actions') }}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <ListSkeletonRows
        v-if="isLoading"
        :columns="['title', 'bar', 'bar', 'none']"
      />
      <template v-else>
        <TableRow
          v-for="folder in folderRows"
          :key="folder.id"
          class="h-14 cursor-pointer"
          @click="emit('open-folder', folder.id)"
        >
          <TableCell>
            <ListTitleCell
              :title="folder.name"
              :description="t('folder.documentCount', folder.documentCount)"
            >
              <template #lead>
                <Icon name="hugeicons:folder-01" class="size-4 text-icon" />
              </template>
            </ListTitleCell>
          </TableCell>
          <TableCell />
          <TableCell class="text-small text-muted-foreground">
            {{ formatDateTime(folder.updatedAt) }}
          </TableCell>
          <TableCell>
            <ListRowActions>
              <DropdownMenuItem @click="emit('rename-folder', folder)">
                <Icon name="hugeicons:pencil-edit-02" />
                {{ t('folder.rename') }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="emit('delete-folder', folder)"
              >
                <Icon name="hugeicons:delete-02" />
                {{ t('folder.delete') }}
              </DropdownMenuItem>
            </ListRowActions>
          </TableCell>
        </TableRow>

        <TableRow
          v-for="document in documents"
          :key="document.id"
          class="h-14 cursor-pointer"
          @click="navigateTo(documentPath(document))"
        >
          <TableCell>
            <ListTitleCell :title="document.title" :to="documentPath(document)">
              <template #lead>
                <Icon name="hugeicons:file-02" class="size-4 text-icon" />
              </template>
            </ListTitleCell>
          </TableCell>
          <TableCell class="text-small text-muted-foreground">
            {{ authorName(document) }}
          </TableCell>
          <TableCell class="text-small text-muted-foreground">
            {{ formatDateTime(document.updatedAt) }}
          </TableCell>
          <TableCell>
            <ListRowActions>
              <DropdownMenuItem @click="emit('rename-document', document)">
                <Icon name="hugeicons:pencil-edit-02" />
                {{ t('document.editor.rename') }}
              </DropdownMenuItem>
              <DocumentMoveSubmenu
                :current-folder-id="document.folderId"
                :folders="moveTargets"
                @move="
                  (folderId) =>
                    emit('move-document', {
                      documentId: document.id,
                      folderId,
                    })
                "
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="emit('delete-document', document.id)"
              >
                <Icon name="hugeicons:delete-02" />
                {{ t('document.list.item.delete') }}
              </DropdownMenuItem>
            </ListRowActions>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </ListTable>
</template>
