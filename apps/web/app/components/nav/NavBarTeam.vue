<script setup lang="ts">
import { ChevronsUpDownIcon } from '@lucide/vue';
</script>

<template>
  <button
    class="flex h-7 items-center gap-1 rounded-md border px-2 text-xs text-stone-600 hover:bg-stone-100"
  >
    <span class="max-w-28 truncate">Personal</span>
    <ChevronsUpDownIcon class="size-3 shrink-0 opacity-50" />
  </button>
</template>
