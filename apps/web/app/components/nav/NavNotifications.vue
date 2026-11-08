<script setup lang="ts">
// Imports
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
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

// Props
withDefaults(defineProps<{ expanded?: boolean }>(), { expanded: false });

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
const activeWorkspaceId = useActiveWorkspaceId();
const { selectWorkspace } = useWorkspaceScopeStore();

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
      workspaceId: parsedNotification.workspaceId,
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
  if (item.workspaceId && item.workspaceId !== activeWorkspaceId.value) {
    selectWorkspace(item.workspaceId);
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
      <button
        type="button"
        class="sidebar-row"
        :aria-label="t('notification.panelTitle')"
      >
        <Icon name="hugeicons:notification-01" class="sidebar-row-icon" />
        <span
          v-if="unreadCount > 0 && !expanded"
          data-testid="notification-dot"
          class="absolute top-1.5 left-6 size-[7px] rounded-full bg-alert ring-[1.5px] ring-canvas"
        />
        <template v-if="expanded">
          <span class="truncate">{{ t('notification.panelTitle') }}</span>
          <span
            v-if="unreadCount > 0"
            data-testid="notification-count"
            class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1.5 font-mono text-caption text-alert-foreground"
          >
            {{ unreadBadgeLabel }}
          </span>
        </template>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      class="w-88 overflow-hidden rounded-2xl p-0"
      side="right"
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
            <Icon name="hugeicons:tick-double-02" class="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-auto gap-1 p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-destructive"
            @click="handleClearAllClick"
          >
            <Icon name="hugeicons:delete-02" class="size-3.5" />
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
          <Icon name="hugeicons:inbox" class="size-6" />
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
