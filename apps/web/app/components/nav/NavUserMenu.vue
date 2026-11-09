<script setup lang="ts">
import { useGetCreditBalance } from '~/features/credit/composables/useCreditApi';
import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';
import { highestRole } from '~/features/organization/lib/roles';
import {
  MENU_CONTENT_CLASS,
  MENU_ROW_CLASS,
  MENU_SEPARATOR_CLASS,
} from '~/lib/menu-row';
import { createInitials } from '~/lib/utils';

defineProps<{
  sizeFull: boolean;
}>();

const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';

const { t, n } = useI18n();
const session = useAuthSession();
const { data: organization } = useGetOrganization();

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
const roleLabel = computed(() =>
  organization.value
    ? t(`organization.roles.${highestRole(organization.value.role)}`)
    : '',
);

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
        class="sidebar-menu-row"
        :aria-label="session?.user?.name"
      >
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-full bg-border-strong text-caption font-medium text-foreground"
        >
          {{ initials }}
        </span>
        <span v-if="sizeFull" class="flex min-w-0 flex-col text-left">
          <span class="truncate text-body font-medium text-foreground">
            {{ session?.user?.name }}
          </span>
          <span class="truncate text-caption text-muted-foreground">
            {{ roleLabel }}
          </span>
        </span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      side="top"
      align="start"
      :side-offset="6"
      :class="MENU_CONTENT_CLASS"
    >
      <div class="flex h-13 items-center gap-2.5 px-2.5">
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-border-strong text-caption font-medium text-foreground"
        >
          {{ initials }}
        </span>
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-body font-medium">
            {{ session?.user?.name }}
          </span>
          <span class="truncate text-caption text-muted-foreground">
            {{ session?.user?.email }}
          </span>
        </span>
      </div>
      <DropdownMenuSeparator :class="MENU_SEPARATOR_CLASS" />
      <DropdownMenuItem
        v-if="displayedCredits !== null"
        as-child
        :class="MENU_ROW_CLASS"
      >
        <NuxtLink to="/settings/credits">
          <Icon name="hugeicons:coins-01" class="size-4 text-foreground" />
          {{ $t('nav.userMenu.credits') }}
          <span class="ml-auto font-mono text-mono text-muted-foreground">
            {{ n(displayedCredits) }}
          </span>
        </NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem as-child :class="MENU_ROW_CLASS">
        <NuxtLink to="/settings/profile">
          <Icon name="hugeicons:settings-01" class="size-4 text-foreground" />
          {{ $t('nav.userMenu.settings') }}
        </NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuSeparator :class="MENU_SEPARATOR_CLASS" />
      <DropdownMenuItem :class="MENU_ROW_CLASS" @click="signOut">
        <Icon name="hugeicons:logout-01" class="size-4 text-foreground" />
        {{ $t('nav.userMenu.signOut') }}
      </DropdownMenuItem>
      <p
        class="flex h-7 items-center px-2.5 text-caption text-muted-foreground"
      >
        {{ $t('nav.userMenu.version', { version: appVersion }) }}
      </p>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
