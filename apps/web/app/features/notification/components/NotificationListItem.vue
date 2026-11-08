<script setup lang="ts">
import type { NotificationGroupKey } from '~/features/notification/lib/group-notifications';
import type { Notification } from '~/features/notification/types';
import {
  NOTIFICATION_TONE_CLASS,
  getNotificationKind,
} from '~/features/notification/types/kind';

// Props
const props = defineProps<{
  notification: Notification;
  title: string;
  message: string;
  groupKey: NotificationGroupKey;
}>();

// Emits
const emit = defineEmits<{
  select: [notificationId: string];
  delete: [notificationId: string];
}>();

// Composables
const { t, locale } = useI18n();

// Computed
const isUnread = computed(() => props.notification.readAt === null);
const kind = computed(() => getNotificationKind(props.notification.type));
const intlLocale = computed(() =>
  locale.value === 'en' ? 'en-GB' : locale.value,
);
const timeLabel = computed(() => {
  const createdAt = new Date(props.notification.createdAt);
  const options: Intl.DateTimeFormatOptions =
    props.groupKey === 'earlier'
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat(intlLocale.value, options).format(createdAt);
});
</script>

<template>
  <div
    class="group relative rounded-md transition-colors focus-within:bg-surface-subtle hover:bg-surface-subtle"
  >
    <button
      type="button"
      class="flex w-full items-start gap-2.5 rounded-md p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      @click="emit('select', props.notification.id)"
    >
      <span
        class="flex size-7 shrink-0 items-center justify-center rounded-md"
        :class="NOTIFICATION_TONE_CLASS[kind.tone]"
      >
        <Icon :name="`hugeicons:${kind.icon}`" class="size-4" />
      </span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="flex h-5 items-center gap-2">
          <span
            class="truncate text-body text-foreground"
            :class="{ 'font-medium': isUnread }"
          >
            {{ props.title }}
          </span>
          <span
            v-if="isUnread"
            data-testid="notification-unread"
            class="size-1.5 shrink-0 rounded-full bg-foreground"
          />
          <span
            class="ml-auto shrink-0 font-mono text-mono-sm text-muted-foreground group-focus-within:invisible group-hover:invisible"
          >
            {{ timeLabel }}
          </span>
        </span>
        <span class="line-clamp-3 text-small text-muted-foreground">
          {{ props.message }}
        </span>
      </span>
    </button>
    <button
      type="button"
      class="absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-sm text-icon opacity-0 outline-none group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-border focus-visible:ring-2 focus-visible:ring-ring"
      :aria-label="t('notification.delete')"
      @click="emit('delete', props.notification.id)"
    >
      <Icon name="hugeicons:cancel-01" class="size-3.5" />
    </button>
  </div>
</template>
