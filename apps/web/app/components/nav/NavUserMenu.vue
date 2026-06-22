<script setup lang="ts">
// Imports
import { BellIcon, ChartColumnIcon, LogOutIcon, SettingsIcon, SparklesIcon, UserIcon } from '@lucide/vue';
import { authClient } from '@repo/auth/client';

// Composables
const { data: session } = await authClient.useSession(useFetch);

// Computed
const initials = computed(() => {
  const name = session.value?.user?.name ?? '';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
});

// Functions
async function signOut() {
  await authClient.signOut();
  await navigateTo('/auth/login');
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        class="flex size-8 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-300"
      >
        {{ initials || '?' }}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-[15.6rem] overflow-hidden rounded-2xl p-0" side="bottom" align="end">
      <div class="flex items-center gap-3 p-4">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700">
          {{ initials || '?' }}
        </div>
        <div class="flex min-w-0 flex-col">
          <p class="truncate text-sm font-semibold">
            {{ session?.user?.name ?? 'User' }}
          </p>
          <p class="truncate text-xs text-stone-500">
            {{ session?.user?.email ?? '' }}
          </p>
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem class="cursor-pointer px-4 py-2">
          <SparklesIcon class="stroke-1.5 size-4" />
          Upgrade to Pro
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem as-child class="cursor-pointer px-4 py-2">
          <NuxtLink prefetch to="/account">
            <UserIcon class="stroke-1.5 size-4" />
            Account
          </NuxtLink>
        </DropdownMenuItem>
        <DropdownMenuItem as-child class="cursor-pointer px-4 py-2">
          <NuxtLink prefetch to="/account/statistics">
            <ChartColumnIcon class="stroke-1.5 size-4" />
            Statistics
          </NuxtLink>
        </DropdownMenuItem>
        <DropdownMenuItem as-child class="cursor-pointer px-4 py-2">
          <NuxtLink prefetch to="/account/settings">
            <SettingsIcon class="stroke-1.5 size-4" />
            Settings
          </NuxtLink>
        </DropdownMenuItem>
        <DropdownMenuItem as-child class="cursor-pointer px-4 py-2">
          <NuxtLink prefetch to="/account/notifications">
            <BellIcon class="stroke-1.5 size-4" />
            Notifications
          </NuxtLink>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem class="cursor-pointer px-4 py-2" @click="signOut">
          <LogOutIcon class="stroke-1.5 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
