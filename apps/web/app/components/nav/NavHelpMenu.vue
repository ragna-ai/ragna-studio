<script setup lang="ts">
import { HelpCircleIcon } from '@lucide/vue';

// --- Refs
const version = import.meta.env.VITE_APP_VERSION ?? 'dev';
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon-sm" class="rounded-lg text-stone-600">
        <HelpCircleIcon class="stroke-1.5 size-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-52 p-3" side="bottom" align="end">
      <div class="space-y-2">
        <p class="text-sm font-semibold">RAGNA Studio</p>
        <p class="text-xs text-stone-500">Version {{ version }}</p>
        <Separator />
        <div class="space-y-0.5">
          <a
            href="https://ragna.io/docs"
            target="_blank"
            rel="noopener noreferrer"
            class="block py-1 text-xs text-stone-600 hover:text-stone-900"
          >
            Documentation
          </a>
          <a
            href="https://ragna.io/changelog"
            target="_blank"
            rel="noopener noreferrer"
            class="block py-1 text-xs text-stone-600 hover:text-stone-900"
          >
            Changelog
          </a>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
