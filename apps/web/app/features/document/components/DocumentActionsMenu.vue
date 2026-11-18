<script setup lang="ts">
import { Button } from '~/components/ui/button';
import DocumentMoveSubmenu from '~/features/document/components/DocumentMoveSubmenu.vue';
import type { DocumentExportFormat, Folder } from '~/features/document/types';

// Props
interface Props {
  folderId: string | null;
  folders: Folder[];
  isExporting: boolean;
}
defineProps<Props>();

// Emits
interface Emits {
  rename: [];
  export: [format: DocumentExportFormat];
  move: [folderId: string | null];
  delete: [];
}
const emit = defineEmits<Emits>();

// Composables
const { t } = useI18n();

interface ExportFormatOption {
  format: DocumentExportFormat;
  label: string;
  icon: `hugeicons:${string}`;
}

const exportFormats: ExportFormatOption[] = [
  {
    format: 'md',
    label: t('document.editor.export.markdown'),
    icon: 'hugeicons:ai-file',
  },
  {
    format: 'txt',
    label: t('document.editor.export.text'),
    icon: 'hugeicons:txt-01',
  },
  {
    format: 'pdf',
    label: t('document.editor.export.pdf'),
    icon: 'hugeicons:pdf-01',
  },
  {
    format: 'docx',
    label: t('document.editor.export.word'),
    icon: 'hugeicons:doc-01',
  },
];
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="text-icon"
        :aria-label="t('nav.topBar.moreActions')"
      >
        <Icon name="hugeicons:more-horizontal" class="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @click="emit('rename')">
        <Icon name="hugeicons:pencil-edit-02" />
        {{ t('document.editor.actions.rename') }}
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger :disabled="isExporting">
          <Icon
            :name="
              isExporting ? 'hugeicons:loading-03' : 'hugeicons:download-01'
            "
            :class="{ 'animate-spin': isExporting }"
          />
          {{ t('document.editor.actions.download') }}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            v-for="item in exportFormats"
            :key="item.format"
            @click="emit('export', item.format)"
          >
            <Icon :name="item.icon" />
            {{ item.label }}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DocumentMoveSubmenu
        :current-folder-id="folderId"
        :folders="folders"
        @move="emit('move', $event)"
      />
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" @click="emit('delete')">
        <Icon name="hugeicons:delete-02" />
        {{ t('document.list.item.delete') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
