<script setup lang="ts">
import { Trash2Icon } from '@lucide/vue';
import type { Notification } from '~/features/notification/types';

// Props
const props = defineProps<{
  notification: Notification;
  title: string;
  message: string;
}>();

// Emits
const emit = defineEmits<{
  select: [notificationId: string];
  delete: [notificationId: string];
}>();

// Composables
const { t } = useI18n();

// Computed
const isUnread = computed(() => props.notification.readAt === null);
const relativeTime = useTimeAgo(() => props.notification.createdAt);
</script>

<template>
  <DropdownMenuItem
    class="flex cursor-pointer flex-col items-start gap-1 px-4 py-3"
    :class="{ 'bg-muted/50': isUnread }"
    @click="emit('select', props.notification.id)"
  >
    <div class="flex w-full items-center gap-2">
      <span v-if="isUnread" class="size-1.5 shrink-0 rounded-full bg-primary" />
      <p class="truncate text-sm font-medium">{{ props.title }}</p>
      <Button
        variant="ghost"
        size="icon"
        class="group ml-auto size-6 shrink-0 text-muted-foreground hover:text-destructive"
        :aria-label="t('notification.delete')"
        @pointerdown.stop
        @click.stop="emit('delete', props.notification.id)"
      >
        <Trash2Icon class="size-3.5 stroke-1 group-hover:stroke-1.5" />
      </Button>
    </div>
    <p class="line-clamp-2 text-xs text-muted-foreground">
      {{ props.message }}
    </p>
    <p class="text-[11px] text-muted-foreground">{{ relativeTime }}</p>
  </DropdownMenuItem>
</template>
