<script setup lang="ts">
import { FileIcon, ImageIcon } from '@lucide/vue';
import { Checkbox } from '~/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { ScrollArea } from '~/components/ui/scroll-area';
import { useGetWorkspaceMedia } from '~/features/email/composables/useEmailMediaApi';
import type { MediaListItem } from '~/features/email/types';

// Attach-from-media-library picker.
// No dedicated media-browser component
// exists elsewhere in apps/web to reuse (checked: media has no list UI
// anywhere, only per-feature upload flows), so this is a minimal list
// dialog against the workspace media list endpoint, feeding the existing
// `mediaIds` plumbing on /email/send.

// Props
const props = defineProps<{
  /** Ids already attached, so they render disabled instead of re-added. */
  alreadyAttachedIds: string[];
}>();

const emit = defineEmits<{
  attach: [MediaListItem[]];
}>();

const open = defineModel<boolean>('open', { default: false });

// Composables
const { t } = useI18n();
const { data, isLoading } = useGetWorkspaceMedia({ enabled: open });

// Refs
const selectedIds = ref<Set<string>>(new Set());

watch(open, (value) => {
  if (!value) selectedIds.value = new Set();
});

// Computed
const items = computed(() => data.value?.media ?? []);
const alreadyAttached = computed(() => new Set(props.alreadyAttachedIds));

// Functions
function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function toggle(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function handleAttach() {
  const selected = items.value.filter((item) => selectedIds.value.has(item.id));
  emit('attach', selected);
  open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('email.compose.mediaPicker.title') }}</DialogTitle>
      </DialogHeader>

      <div v-if="isLoading" class="flex justify-center py-8">
        <Spinner />
      </div>
      <p v-else-if="items.length === 0" class="py-8 text-center text-sm text-muted-foreground">
        {{ t('email.compose.mediaPicker.empty') }}
      </p>
      <ScrollArea v-else class="h-80">
        <ul class="space-y-1 pr-3">
          <li
            v-for="item in items"
            :key="item.id"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            :class="alreadyAttached.has(item.id) ? 'opacity-40' : 'cursor-pointer hover:bg-muted'"
            @click="!alreadyAttached.has(item.id) && toggle(item.id)"
          >
            <Checkbox
              :model-value="selectedIds.has(item.id)"
              :disabled="alreadyAttached.has(item.id)"
              @click.stop="toggle(item.id)"
            />
            <ImageIcon v-if="isImage(item.mimeType)" class="size-4 shrink-0 text-muted-foreground" />
            <FileIcon v-else class="size-4 shrink-0 text-muted-foreground" />
            <span class="flex-1 truncate">{{ item.filename }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{{ formatBytes(item.size) }}</span>
          </li>
        </ul>
      </ScrollArea>

      <DialogFooter>
        <Button variant="ghost" @click="open = false">{{ t('common.cancel') }}</Button>
        <Button :disabled="selectedIds.size === 0" @click="handleAttach">
          {{ t('email.compose.mediaPicker.attach', { count: selectedIds.size }) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
