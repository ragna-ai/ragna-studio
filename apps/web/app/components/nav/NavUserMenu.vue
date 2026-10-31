<script setup lang="ts">
import {
  ChevronsUpDownIcon,
  CoinsIcon,
  EllipsisIcon,
  HelpCircleIcon,
  LogOutIcon,
  SettingsIcon,
} from '@lucide/vue';
import { useGetCreditBalance } from '~/features/credit/composables/useCreditApi';
import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';
import WorkspaceCreateDialog from '~/features/workspace/components/WorkspaceCreateDialog.vue';
import WorkspaceManageDialog from '~/features/workspace/components/WorkspaceManageDialog.vue';
import WorkspaceMenuItems from '~/features/workspace/components/WorkspaceMenuItems.vue';
import { useWorkspaceSwitcher } from '~/features/workspace/composables/useWorkspaceSwitcher';
import { createInitials } from '~/lib/utils';

defineProps<{
  sizeFull: boolean;
}>();

const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';

const isCreateDialogOpen = ref(false);
const isManageDialogOpen = ref(false);

const session = useAuthSession();
const { data: organization } = useGetOrganization();
const {
  workspaces,
  groups,
  activeLabel,
  initials: workspaceInitials,
  isActive,
  selectWorkspace,
} = useWorkspaceSwitcher();

// Fetched once per session (staleTime: Infinity in the composable) and
// refetched by ChatConversation.vue after a chat turn ends.
// Rounded to whole credits for display;
// the exact fractional amount only matters on the usage table.
const { data: creditBalance } = useGetCreditBalance();
const displayedCredits = computed(() => {
  const credits = creditBalance.value?.credit.balanceCredits;
  return credits === undefined ? null : Math.round(credits);
});

const initials = computed(() => createInitials(session.value?.user?.name));

async function signOut() {
  await useAuth().signOut();
  await navigateTo('/auth/login');
  // info: we don't clear the session state here to avoid a UI flash. The
  // global middleware will refresh it on the next navigation.
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="sidebar-row h-11"
        :aria-label="session?.user?.name"
      >
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-medium text-foreground"
        >
          {{ initials }}
        </span>
        <span v-if="sizeFull" class="flex min-w-0 flex-col text-left">
          <span class="truncate text-sm leading-tight text-foreground">
            {{ session?.user?.name }}
          </span>
          <span class="truncate text-xs leading-tight text-muted-foreground">
            {{ activeLabel }}
          </span>
        </span>
        <EllipsisIcon
          v-if="sizeFull"
          class="ml-auto size-4 shrink-0 text-stone-500"
        />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      class="w-[15.6rem] rounded-2xl p-0"
      side="right"
      align="end"
    >
      <div class="flex items-center gap-3 p-4">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted"
        >
          <span class="text-sm font-medium">{{ initials }}</span>
        </div>
        <div class="flex min-w-0 flex-col">
          <p class="truncate text-sm leading-none font-medium">
            {{ session?.user?.name }}
          </p>
          <p class="mt-1 truncate text-xs text-muted-foreground">
            {{ session?.user?.email }}
          </p>
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuGroup class="p-1">
        <DropdownMenuLabel class="text-xs text-muted-foreground">
          {{ $t('nav.userMenu.workspace') }}
        </DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger class="gap-2 py-1.5">
            <span
              class="flex size-7 shrink-0 items-center justify-center rounded-md bg-stone-800 text-xs font-medium text-white"
            >
              {{ workspaceInitials }}
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm leading-tight font-medium">
                {{ activeLabel }}
              </span>
              <span
                v-if="organization?.name"
                class="truncate text-xs leading-tight text-muted-foreground"
              >
                {{ organization.name }}
              </span>
            </span>
            <ChevronsUpDownIcon class="size-4 shrink-0" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="w-56">
            <WorkspaceMenuItems
              :groups="groups"
              :is-active="isActive"
              show-add
              @select="selectWorkspace"
              @add="isCreateDialogOpen = true"
              @manage="isManageDialogOpen = true"
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
      <template v-if="displayedCredits !== null">
        <DropdownMenuSeparator />
        <div
          class="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground"
        >
          <CoinsIcon class="size-4 stroke-1.5" />
          {{ $t('nav.userMenu.credits', { count: displayedCredits }) }}
        </div>
      </template>
      <DropdownMenuSeparator />
      <DropdownMenuGroup class="p-1">
        <DropdownMenuItem as-child class="cursor-pointer px-3 py-2">
          <NuxtLink to="/settings/profile">
            <SettingsIcon class="mr-2 size-4 stroke-1.5" />
            {{ $t('nav.userMenu.settings') }}
          </NuxtLink>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger class="px-3 py-2">
            <HelpCircleIcon class="mr-2 size-4 stroke-1.5" />
            {{ $t('nav.help') }}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <p class="px-3 py-2 text-xs text-muted-foreground">
              {{ $t('nav.helpMenu.version', { version: appVersion }) }}
            </p>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup class="p-1">
        <DropdownMenuItem class="cursor-pointer px-3 py-2" @click="signOut">
          <LogOutIcon class="mr-2 size-4 stroke-1.5" />
          {{ $t('nav.userMenu.signOut') }}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
  <WorkspaceCreateDialog v-model:open="isCreateDialogOpen" />
  <WorkspaceManageDialog
    v-model:open="isManageDialogOpen"
    :workspaces="workspaces"
  />
</template>
