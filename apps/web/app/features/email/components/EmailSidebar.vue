<script setup lang="ts">
import {
  FileEditIcon,
  HelpCircleIcon,
  PenSquareIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
} from '@lucide/vue';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Spinner } from '~/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import EmailSyncStatusBadge from '~/features/email/components/EmailSyncStatusBadge.vue';
import { useSyncEmailAccount } from '~/features/email/composables/useEmailAccountApi';
import { EMAIL_FOLDERS } from '~/features/email/lib/email-folders';
import { isManualAccountSyncActive } from '~/features/email/lib/email-account-sync-poll';
import type {
  EmailAccount,
  EmailCategory,
  EmailFolder,
} from '~/features/email/types';

// Props
const props = defineProps<{
  account: EmailAccount;
  categories: EmailCategory[];
  labels: string[];
  folder: EmailFolder | null;
  categoryId: string | null;
  labelId: string | null;
  isSearching: boolean;
  isDraftsView: boolean;
  pendingDraftsCount: number;
  isComposing: boolean;
}>();

// Emits
const emit = defineEmits<{
  compose: [];
  search: [string];
  selectFolder: [EmailFolder];
  selectDrafts: [];
  selectCategory: [string | null];
  selectLabel: [string | null];
}>();

// Refs
const searchInput = ref('');

// Composables
const { t } = useI18n();
const { mutate: syncAccount, isPending: isSyncPending } = useSyncEmailAccount();

// Watchers
const emitSearch = useDebounceFn(
  (value: string) => emit('search', value.trim()),
  300,
);
watch(searchInput, emitSearch);

// Computed
// Three independent reasons the button should show "busy", covering the
// whole job lifetime rather than just the (often shorter) window where the
// cached syncState literally reads 'syncing':
// - `syncState === 'syncing'`: a cron-triggered sync already in flight.
// - `isSyncPending`: the POST /email/account/sync request itself.
// - `isManualAccountSyncActive`: from trigger success until the account
//   query has *observed* the job settle (or the 60s hard-stop), covering
//   the enqueue -> worker-picks-it-up gap and fast syncs that finish
//   between two poll ticks (email-account-sync-poll.ts).
const isSyncing = computed(
  () =>
    props.account.syncState === 'syncing' ||
    isSyncPending.value ||
    isManualAccountSyncActive.value,
);
const searchHintKey = computed(
  () => `email.sidebar.searchHint.${props.account.provider}`,
);

// Functions
function isActiveFolder(folder: EmailFolder): boolean {
  return (
    !props.isSearching &&
    props.folder === folder &&
    !props.categoryId &&
    !props.labelId
  );
}

function handleSyncNow() {
  if (isSyncing.value) return;
  syncAccount();
}
</script>

<template>
  <div class="flex h-full w-64 shrink-0 flex-col border-r">
    <div class="shrink-0 space-y-3 p-3">
      <Button
        class="w-full justify-start"
        :disabled="props.isComposing"
        @click="emit('compose')"
      >
        <Spinner v-if="props.isComposing" class="mr-2 size-4" />
        <PenSquareIcon v-else class="mr-2 size-4" />
        {{ t('email.sidebar.compose') }}
      </Button>
      <div class="flex items-center gap-1">
        <div class="relative flex-1">
          <SearchIcon
            class="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            v-model="searchInput"
            class="h-8 pl-8 text-sm"
            :placeholder="t('email.sidebar.searchPlaceholder')"
          />
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-8 shrink-0"
                :aria-label="t('email.sidebar.searchHintLabel')"
              >
                <HelpCircleIcon class="size-3.5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" class="max-w-56">
              <p>{{ t(searchHintKey) }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>

    <ScrollArea class="min-h-0 flex-1 px-3">
      <nav class="space-y-4 pb-4">
        <ul class="space-y-0.5">
          <li v-for="config in EMAIL_FOLDERS" :key="config.id">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              :class="{ 'bg-muted font-medium': isActiveFolder(config.id) }"
              @click="emit('selectFolder', config.id)"
            >
              <component
                :is="config.icon"
                class="size-4 shrink-0 text-muted-foreground"
              />
              {{ t(config.labelKey) }}
            </button>
          </li>
          <!-- Drafts: a client-only pseudo-folder, not an `EMAIL_FOLDERS`
               entry - those ids are thread-list filters validated against
               the API's emailFolderEnum, and a draft list isn't a thread
               list. Selecting it behaves exactly like any other folder
               button (same list + reading-pane layout, no navigation). -->
          <li>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              :class="{ 'bg-muted font-medium': props.isDraftsView }"
              @click="emit('selectDrafts')"
            >
              <FileEditIcon class="size-4 shrink-0 text-muted-foreground" />
              {{ t('email.sidebar.drafts') }}
              <Badge
                v-if="props.pendingDraftsCount > 0"
                variant="secondary"
                class="ml-auto"
              >
                {{ props.pendingDraftsCount }}
              </Badge>
            </button>
          </li>
        </ul>

        <div v-if="props.categories.length > 0">
          <p class="px-2 pb-1 text-xs font-medium text-muted-foreground">
            {{ t('email.sidebar.categories') }}
          </p>
          <ul class="space-y-0.5">
            <li v-for="category in props.categories" :key="category.id">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                :class="{
                  'bg-muted font-medium':
                    !props.isSearching && props.categoryId === category.id,
                }"
                @click="emit('selectCategory', category.id)"
              >
                <span
                  class="size-2.5 shrink-0 rounded-full"
                  :style="{ backgroundColor: category.color }"
                />
                <span class="truncate">{{ category.name }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div v-if="props.labels.length > 0">
          <p class="px-2 pb-1 text-xs font-medium text-muted-foreground">
            {{ t('email.sidebar.labels') }}
          </p>
          <ul class="space-y-0.5">
            <li v-for="label in props.labels" :key="label">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                :class="{
                  'bg-muted font-medium':
                    !props.isSearching && props.labelId === label,
                }"
                @click="emit('selectLabel', label)"
              >
                <TagIcon class="size-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate">{{ label }}</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </ScrollArea>

    <div class="shrink-0 space-y-2 border-t p-3">
      <div class="flex items-center justify-between gap-2">
        <EmailSyncStatusBadge
          :sync-state="props.account.syncState"
          :last-synced-at="props.account.lastSyncedAt"
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-6"
                :disabled="isSyncing"
                :aria-label="t('email.sidebar.syncNow')"
                @click="handleSyncNow"
              >
                <RefreshCwIcon
                  class="size-3.5"
                  :class="{ 'animate-spin': isSyncing }"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ t('email.sidebar.syncNow') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <NuxtLinkLocale
        to="/mail/settings"
        class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
      >
        <SettingsIcon class="size-4 text-muted-foreground" />
        {{ t('email.sidebar.settings') }}
      </NuxtLinkLocale>
    </div>
  </div>
</template>
