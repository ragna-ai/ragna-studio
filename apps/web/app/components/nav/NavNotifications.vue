<script setup lang="ts">
// Imports
import { BellIcon, CheckCheckIcon, InboxIcon, Trash2Icon } from '@lucide/vue';
import NotificationListItem from '~/features/notification/components/NotificationListItem.vue';
import {
  useDeleteAllNotifications,
  useDeleteNotification,
  useGetNotificationList,
  useGetUnreadNotificationCount,
  useMarkAllReadNotification,
  useMarkReadNotification,
} from '~/features/notification/composables/useNotificationApi';
import useNotificationParser from '~/features/notification/composables/useNotificationParser';

// Refs
const open = ref(false);

// Composables
const { t } = useI18n();
const { formatNotificationForUi } = useNotificationParser();
const { data: unreadCountData } = useGetUnreadNotificationCount();
const { data: listData, isLoading } = useGetNotificationList(open);
const markRead = useMarkReadNotification();
const markAllRead = useMarkAllReadNotification();
const deleteNotification = useDeleteNotification();
const deleteAll = useDeleteAllNotifications();

// Computed
const unreadCount = computed(() => unreadCountData.value?.count ?? 0);
const unreadBadgeLabel = computed(() =>
  unreadCount.value > 9 ? '9+' : String(unreadCount.value),
);
const notifications = computed(() => listData.value?.notifications ?? []);
const notificationItems = computed(() =>
  notifications.value.map((notification) => {
    const parsedNotification = formatNotificationForUi(notification);

    return {
      notification,
      title: parsedNotification.title,
      message: parsedNotification.message,
      to: parsedNotification.to,
    };
  }),
);

// Functions
async function handleNotificationSelect(notificationId: string) {
  open.value = false;
  const item = notificationItems.value.find(
    (entry) => entry.notification.id === notificationId,
  );
  if (!item) {
    console.warn(
      `Notification with ID ${notificationId} not found in notificationItems`,
    );
    return;
  }
  if (item.notification.readAt === null) {
    markRead.mutate(notificationId);
  }
  if (item?.to) {
    await navigateTo(item.to);
  }
}

function handleMarkAllReadClick() {
  markAllRead.mutate();
}

function handleNotificationDelete(notificationId: string) {
  deleteNotification.mutate(notificationId);
}

function handleClearAllClick() {
  deleteAll.mutate();
}
</script>

<template>
  <DropdownMenu v-model:open="open">
    <DropdownMenuTrigger as-child>
      <button class="relative">
        <BellIcon class="size-5 stroke-1 hover:stroke-1.5" />
        <span
          v-if="unreadCount > 0"
          class="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white"
        >
          {{ unreadBadgeLabel }}
        </span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      class="w-88 overflow-hidden rounded-2xl p-0"
      side="bottom"
      align="end"
    >
      <div class="flex items-center justify-between p-4">
        <p class="text-sm font-medium">{{ t('notification.panelTitle') }}</p>
        <div v-if="notifications.length > 0" class="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            class="h-auto gap-1 p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            @click="handleMarkAllReadClick"
          >
            <CheckCheckIcon class="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-auto gap-1 p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-destructive"
            @click="handleClearAllClick"
          >
            <Trash2Icon class="size-3.5" />
          </Button>
        </div>
      </div>
      <DropdownMenuSeparator />
      <div class="max-h-96 overflow-y-auto">
        <div v-if="isLoading" class="flex justify-center py-8">
          <Spinner />
        </div>
        <div
          v-else-if="notifications.length === 0"
          class="flex flex-col items-center gap-2 py-8 text-muted-foreground"
        >
          <InboxIcon class="size-6 stroke-1" />
          <p class="text-sm">{{ t('notification.empty') }}</p>
        </div>
        <NotificationListItem
          v-for="item in notificationItems"
          :key="item.notification.id"
          :notification="item.notification"
          :title="item.title"
          :message="item.message"
          @select="handleNotificationSelect"
          @delete="handleNotificationDelete"
        />
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
