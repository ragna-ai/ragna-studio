<script setup lang="ts">
import type { Folder } from '~/features/document/types';

// Props
interface Props {
  /** The document's current folder, `null` at the top level. */
  currentFolderId: string | null;
  folders: Folder[];
}
defineProps<Props>();

// Emits
interface Emits {
  move: [folderId: string | null];
}
const emit = defineEmits<Emits>();

// Composables
const { t } = useI18n();
</script>

<template>
  <DropdownMenuSub>
    <DropdownMenuSubTrigger>
      <Icon name="hugeicons:folder-export" />
      {{ t('document.list.item.moveToFolder') }}
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent>
      <DropdownMenuItem
        :disabled="currentFolderId === null"
        @click="emit('move', null)"
      >
        <Icon name="hugeicons:folder-remove" />
        {{ t('document.list.noFolder') }}
      </DropdownMenuItem>
      <DropdownMenuItem
        v-for="folder in folders"
        :key="folder.id"
        :disabled="currentFolderId === folder.id"
        @click="emit('move', folder.id)"
      >
        <Icon name="hugeicons:folder-01" />
        {{ folder.name }}
      </DropdownMenuItem>
    </DropdownMenuSubContent>
  </DropdownMenuSub>
</template>
