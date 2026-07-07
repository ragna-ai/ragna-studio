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
import { authClient } from '@repo/auth/client';

defineProps<{
  sizeFull: boolean;
}>();

const { data: session } = await authClient.useSession(useFetch);

function createInitials(name: string) {
  if (!name) return '';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('');
}

const initials = computed(() => createInitials(session.value?.user?.name ?? ''));

async function signOut() {
  await authClient.signOut();
  await navigateTo('/auth/login');
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        class="rounded-xl overflow-hidden p-0"
        :class="{
          'w-full bg-muted': sizeFull,
          'bg-transparent hover:bg-transparent': !sizeFull,
        }"
      >
        <div class="flex items-center" :class="{ 'w-full': sizeFull }">
          <div
            class="flex size-8 items-center justify-center rounded-full bg-muted shrink-0 border border-stone-400"
          >
            <span class="text-sm font-medium">{{ initials }}</span>
          </div>
          <div v-if="sizeFull" class="pl-3 flex items-center justify-between w-full">
            <div class="">
              <div class="flex flex-col items-start">
                <span class="text-xs text-muted-foreground truncate">{{ session?.user?.name }}</span>
                <span class="text-xs text-muted-foreground truncate">{{ session?.user?.email }}</span>
              </div>
            </div>
            <div class="">
              <ChevronsUpDownIcon class="h-4 w-4" />
            </div>
          </div>
        </div>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-[15.6rem] overflow-hidden rounded-2xl p-0" side="bottom" align="end">
      <div class="flex items-center gap-3 p-4">
        <div class="flex size-8 items-center justify-center rounded-full shrink-0 bg-muted relative">
          <span class="text-sm font-medium">{{ initials }}</span>
        </div>
        <div class="flex flex-col truncate">
          <p class="text-sm font-medium leading-none truncate">{{ session?.user?.name }}</p>
          <p class="text-xs text-muted-foreground mt-1 truncate">{{ session?.user?.email }}</p>
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
