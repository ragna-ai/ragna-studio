<script setup lang="ts">
import { Button } from '~/components/ui/button';
// Imports
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import NotificationListItem from '~/features/notification/components/NotificationListItem.vue';
import {
  useDeleteAllNotifications,
  useDeleteNotification,
  useGetNotificationList,
  useGetUnreadNotificationCount,
  useMarkAllReadNotification,
  useMarkReadNotification,
} from '~/features/notification/composables/useNotificationApi';
import { groupNotifications } from '~/features/notification/lib/group-notifications';
import useNotificationParser from '~/features/notification/composables/useNotificationParser';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

// Props
withDefaults(defineProps<{ expanded?: boolean }>(), {
  expanded: false,
});

// Refs
const open = ref(false);

// Composables
const { t } = useI18n();
const { formatNotificationForUi } = useNotificationParser();
const { data: unreadCountData } = useGetUnreadNotificationCount();
const { data: listData, isPending } = useGetNotificationList(open);
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

const notificationGroups = computed(() =>
  groupNotifications(
    notificationItems.value.map((entry) => ({
      ...entry,
      createdAt: entry.notification.createdAt,
    })),
  ),
);

// Functions
// Focusing the first header button would open its tooltip, and Escape would close that first.
function focusPanel(event: Event) {
  event.preventDefault();
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
}

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
  <TooltipProvider :delay-duration="300">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="sidebar-row"
          :aria-label="t('notification.panelTitle')"
        >
          <Icon name="hugeicons:notification-01" class="sidebar-row-icon" />
          <span
            v-if="unreadCount > 0 && !expanded"
            class="absolute top-1.5 left-6 size-1.75 rounded-full bg-alert ring-[1.5px] ring-canvas"
          />
          <template v-if="expanded">
            <span class="truncate">{{ t('notification.panelTitle') }}</span>
            <span
              v-if="unreadCount > 0"
              class="-mr-px ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1.5 font-mono text-caption text-alert-foreground"
            >
              {{ unreadBadgeLabel }}
            </span>
          </template>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        padding="list"
        class="flex max-h-130 w-90 flex-col overflow-hidden"
        @open-auto-focus="focusPanel"
      >
        <div class="flex h-11 shrink-0 items-center gap-3 pr-1.5 pl-2.5">
          <p class="text-body font-medium">
            {{ t('notification.panelTitle') }}
          </p>
          <p v-if="unreadCount > 0" class="text-caption text-muted-foreground">
            {{ t('notification.newCount', { count: unreadCount }) }}
          </p>
          <div
            v-if="notifications.length > 0"
            class="ml-auto flex items-center gap-1"
          >
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-icon"
                  :aria-label="t('notification.markAllRead')"
                  @click="handleMarkAllReadClick"
                >
                  <Icon name="hugeicons:tick-double-02" class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{
                t('notification.markAllRead')
              }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-icon"
                  :aria-label="t('notification.clearAll')"
                  @click="handleClearAllClick"
                >
                  <Icon name="hugeicons:delete-02" class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ t('notification.clearAll') }}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div class="my-1 h-px shrink-0 bg-border" />
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="isPending" class="flex h-42 items-center justify-center">
            <Spinner />
          </div>
          <div
            v-else-if="notifications.length === 0"
            class="flex h-42 flex-col items-center justify-center gap-2 px-6 text-center"
          >
            <Icon name="hugeicons:inbox" class="size-6 text-icon" />
            <p class="text-body font-medium">{{ t('notification.empty') }}</p>
            <p class="text-small text-muted-foreground">
              {{ t('notification.emptyHint') }}
            </p>
          </div>
          <template v-else>
            <section v-for="group in notificationGroups" :key="group.key">
              <p
                class="flex h-7 items-center px-2.5 text-caption text-muted-foreground"
              >
                {{ t(`notification.groups.${group.key}`) }}
              </p>
              <NotificationListItem
                v-for="item in group.items"
                :key="item.notification.id"
                :notification="item.notification"
                :title="item.title"
                :message="item.message"
                :group-key="group.key"
                @select="handleNotificationSelect"
                @delete="handleNotificationDelete"
              />
            </section>
          </template>
        </div>
      </PopoverContent>
    </Popover>
  </TooltipProvider>
</template>
