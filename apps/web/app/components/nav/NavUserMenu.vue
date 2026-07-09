<script setup lang="ts">
import {
  BellIcon,
  ChartColumnIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  SettingsIcon,
  SparklesIcon,
  UserIcon,
} from '@lucide/vue';

defineProps<{
  sizeFull: boolean;
}>();

const session = useAuthSession();

function createInitials(name: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('');
}

const initials = computed(() =>
  createInitials(session.value?.user?.name ?? '?'),
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
      <Button
        variant="ghost"
        class="overflow-hidden rounded-xl p-0"
        :class="{
          'w-full bg-muted': sizeFull,
          'bg-transparent hover:bg-transparent': !sizeFull,
        }"
      >
        <div class="flex items-center" :class="{ 'w-full': sizeFull }">
          <div
            class="flex size-8 shrink-0 items-center justify-center rounded-full border border-stone-400 bg-muted"
          >
            <span class="text-sm font-medium">{{ initials }}</span>
          </div>
          <div
            v-if="sizeFull"
            class="flex w-full items-center justify-between pl-3"
          >
            <div class="">
              <div class="flex flex-col items-start">
                <span class="truncate text-xs text-muted-foreground">{{
                  session?.user?.name
                }}</span>
                <span class="truncate text-xs text-muted-foreground">{{
                  session?.user?.email
                }}</span>
              </div>
            </div>
            <div class="">
              <ChevronsUpDownIcon class="h-4 w-4" />
            </div>
          </div>
        </div>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      class="w-[15.6rem] overflow-hidden rounded-2xl p-0"
      side="bottom"
      align="end"
    >
      <div class="flex items-center gap-3 p-4">
        <div
          class="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted"
        >
          <span class="text-sm font-medium">{{ initials }}</span>
        </div>
        <div class="flex flex-col truncate">
          <p class="truncate text-sm leading-none font-medium">
            {{ session?.user?.name }}
          </p>
          <p class="mt-1 truncate text-xs text-muted-foreground">
            {{ session?.user?.email }}
          </p>
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem class="cursor-pointer px-4 py-2">
          <SparklesIcon class="mr-2 size-4 stroke-1.5" />
          Upgrade to Pro
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem as-child class="cursor-pointer px-4 py-2">
          <NuxtLink to="/account">
            <UserIcon class="mr-2 size-4 stroke-1.5" />
            Account
          </NuxtLink>
        </DropdownMenuItem>
        <DropdownMenuItem as-child class="cursor-pointer px-4 py-2">
          <NuxtLink to="/account/statistics">
            <ChartColumnIcon class="mr-2 size-4 stroke-1.5" />
            Statistics
          </NuxtLink>
        </DropdownMenuItem>
        <DropdownMenuItem as-child class="cursor-pointer px-4 py-2">
          <NuxtLink to="/account/settings">
            <SettingsIcon class="mr-2 size-4 stroke-1.5" />
            Settings
          </NuxtLink>
        </DropdownMenuItem>
        <DropdownMenuItem as-child class="cursor-pointer px-4 py-2">
          <NuxtLink to="/account/notifications">
            <BellIcon class="mr-2 size-4 stroke-1.5" />
            Notifications
          </NuxtLink>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem class="cursor-pointer px-4 py-2" @click="signOut">
          <LogOutIcon class="mr-2 size-4 stroke-1.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
