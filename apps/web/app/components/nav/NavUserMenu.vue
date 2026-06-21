<script setup lang="ts">
import { LogOutIcon, SettingsIcon, UserIcon } from '@lucide/vue';
import { authClient } from '@repo/auth/client';

const { data: session } = await authClient.useSession(useFetch);

const initials = computed(() => {
  const name = session.value?.user?.name ?? '';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
});

const open = ref(false);

async function handleNavigate(path: string) {
  open.value = false;
  await navigateTo(path);
}

async function handleSignOut() {
  open.value = false;
  await authClient.signOut();
  await navigateTo('/auth/login');
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        class="flex size-8 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-300"
      >
        {{ initials || '?' }}
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-64 p-0" side="bottom" align="end">
      <Command>
        <div class="flex flex-col gap-0.5 border-b px-3 py-2.5">
          <p class="truncate text-sm font-semibold">
            {{ session?.user?.name ?? 'User' }}
          </p>
          <p class="truncate text-xs text-stone-500">
            {{ session?.user?.email ?? '' }}
          </p>
        </div>
        <CommandList>
          <CommandGroup>
            <CommandItem value="account" @select="handleNavigate('/account')">
              <UserIcon class="stroke-1.5 mr-2 size-4" />
              Account
            </CommandItem>
            <CommandItem value="settings" @select="handleNavigate('/account/settings')">
              <SettingsIcon class="stroke-1.5 mr-2 size-4" />
              Settings
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup>
            <CommandItem value="sign-out" @select="handleSignOut">
              <LogOutIcon class="stroke-1.5 mr-2 size-4" />
              Sign out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
