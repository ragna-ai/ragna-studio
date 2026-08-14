<script setup lang="ts">
import { DownloadIcon, PaperclipIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useDownloadEmailAttachment, useGetEmailMessageAttachments } from '~/features/email/composables/useEmailMessageApi';

// Props
const props = defineProps<{ messageId: string; expanded: boolean }>();

// Composables
const { t } = useI18n();
const messageIdRef = computed(() => props.messageId);
const expandedRef = computed(() => props.expanded);
const { data, isLoading } = useGetEmailMessageAttachments(messageIdRef, { enabled: expandedRef });
const { mutate: downloadAttachment, variables: downloadingVariables, isPending: isDownloading } =
  useDownloadEmailAttachment();

function isRowDownloading(attachmentId: string): boolean {
  return isDownloading.value && downloadingVariables.value?.attachment.id === attachmentId;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <div v-if="props.expanded && (isLoading || data?.attachments.length)" class="mt-3 border-t pt-2">
    <div v-if="isLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
      <Spinner class="size-3" />
      {{ t('email.attachments.loading') }}
    </div>
    <ul v-else class="flex flex-wrap gap-2">
      <li
        v-for="attachment in data?.attachments ?? []"
        :key="attachment.id"
        class="flex items-center gap-2 rounded-md border bg-muted/40 py-1 pr-1 pl-2 text-xs"
      >
        <PaperclipIcon class="size-3 shrink-0 text-muted-foreground" />
        <span class="max-w-40 truncate">{{ attachment.filename }}</span>
        <span class="text-muted-foreground">{{ formatBytes(attachment.size) }}</span>
        <Button
          variant="ghost"
          size="icon"
          class="size-5"
          :disabled="isRowDownloading(attachment.id)"
          :aria-label="t('email.attachments.download')"
          @click="downloadAttachment({ messageId: props.messageId, attachment })"
        >
          <Spinner v-if="isRowDownloading(attachment.id)" class="size-3" />
          <DownloadIcon v-else class="size-3" />
        </Button>
      </li>
    </ul>
  </div>
</template>
