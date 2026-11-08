<script setup lang="ts">
defineProps<{ collapsed?: boolean }>();
</script>

<template>
  <button
    v-if="collapsed"
    type="button"
    aria-disabled="true"
    :aria-label="$t('nav.search')"
    class="flex h-8 w-full cursor-default items-center justify-center rounded-md border bg-background"
  >
    <Icon name="hugeicons:search-01" class="size-4 text-icon" />
  </button>
  <button
    v-else
    type="button"
    aria-disabled="true"
    class="flex h-8 w-full cursor-default items-center gap-3 rounded-md border bg-background pr-1.5 pl-[11px] text-body text-muted-foreground"
  >
    <Icon name="hugeicons:search-01" class="size-4 shrink-0 text-icon" />
    <span class="truncate">{{ $t('nav.search') }}</span>
    <kbd
      class="ml-auto flex h-5 items-center rounded-[5px] border px-[5px] font-mono text-caption font-medium"
    >
      ⌘K
    </kbd>
  </button>
</template>
