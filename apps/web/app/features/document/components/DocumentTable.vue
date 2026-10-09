<script setup lang="ts">
import { FileTextIcon, Trash2Icon } from '@lucide/vue';
import type { Document, Folder } from '~/features/document/types';

// shadcn's Select can't use an empty string as an item value (it's the
// internal "no selection" sentinel), so "No folder" needs its own
// placeholder value, mapped back to `null` on change.
const NO_FOLDER = '__none__';

interface DocumentGroup {
  key: string;
  label: string;
  documents: Document[];
}

// Props
const props = defineProps<{ documents: Document[]; folders: Folder[] }>();

// Emits
const emit = defineEmits<{
  'delete-document': [documentId: string];
  'move-document': [payload: { documentId: string; folderId: string | null }];
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Computed
// Root-level documents get their own trailing group, but only when there's
// something to show for it: with no folders at all a bare "No folder"
// header would just be noise above a flat list.
const groups = computed<DocumentGroup[]>(() => {
  const rootDocuments: Document[] = [];
  const byFolderId = new Map<string, Document[]>();
  for (const doc of props.documents) {
    if (doc.folderId === null) {
      rootDocuments.push(doc);
      continue;
    }
    const existing = byFolderId.get(doc.folderId) ?? [];
    existing.push(doc);
    byFolderId.set(doc.folderId, existing);
  }

  const folderGroups = props.folders.map((folder) => ({
    key: folder.id,
    label: folder.name,
    documents: byFolderId.get(folder.id) ?? [],
  }));

  if (rootDocuments.length === 0 && folderGroups.length > 0) {
    return folderGroups;
  }
  return [
    ...folderGroups,
    {
      key: 'root',
      label: t('document.list.noFolder'),
      documents: rootDocuments,
    },
  ];
});

function authorName(document: Document): string {
  return (
    document.createdByAgentName ??
    document.createdByUserName ??
    t('organization.formerMember')
  );
}

function moveDocument(document: Document, folderId: string) {
  emit('move-document', {
    documentId: document.id,
    folderId: folderId === NO_FOLDER ? null : folderId,
  });
}
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>&nbsp;</TableHead>
        <TableHead>{{ t('common.title') }}</TableHead>
        <TableHead>{{ t('document.list.table.author') }}</TableHead>
        <TableHead>{{ t('common.updated') }}</TableHead>
        <TableHead>{{ t('common.folder') }}</TableHead>
        <TableHead class="text-right">{{ t('common.actions') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="documents.length === 0" :colspan="6">
        {{ t('document.list.empty') }}
      </TableEmpty>
      <template v-for="group in groups" :key="group.key">
        <TableRow v-if="folders.length > 0" class="hover:bg-transparent">
          <TableCell
            colspan="6"
            class="bg-stone-50 text-xs font-semibold text-muted-foreground"
          >
            {{ group.label }}
          </TableCell>
        </TableRow>
        <TableRow
          v-for="document in group.documents"
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
          <TableCell class="whitespace-nowrap" @click.stop>
            <Select
              :model-value="document.folderId ?? NO_FOLDER"
              @update:model-value="(v) => moveDocument(document, String(v))"
            >
              <SelectTrigger class="w-40" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="NO_FOLDER">{{
                  t('document.list.noFolder')
                }}</SelectItem>
                <SelectItem
                  v-for="folder in folders"
                  :key="folder.id"
                  :value="folder.id"
                >
                  {{ folder.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell class="text-right whitespace-nowrap" @click.stop>
            <Button
              variant="outline"
              size="icon"
              :aria-label="t('document.list.item.delete')"
              @click="() => emit('delete-document', document.id)"
            >
              <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
            </Button>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </Table>
</template>
