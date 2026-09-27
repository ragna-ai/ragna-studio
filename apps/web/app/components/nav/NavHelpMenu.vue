<script setup lang="ts">
import { HelpCircleIcon } from '@lucide/vue';

const version = import.meta.env.VITE_APP_VERSION || 'dev';
</script>

<template>
  <Popover>
    <PopoverTrigger as-child class="flex">
      <button>
        <HelpCircleIcon class="size-5 stroke-1 hover:stroke-1.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-[14rem] rounded-2xl overflow-hidden p-0" side="bottom">
      <div class="p-5">
        <p class="text-xs opacity-75">App Version: {{ version }}</p>
      </div>
    </PopoverContent>
  </Popover>
</template>
