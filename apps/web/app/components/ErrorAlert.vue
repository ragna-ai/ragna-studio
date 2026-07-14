<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { TriangleAlertIcon, XIcon } from '@lucide/vue';

const { error, clearError } = useErrorAlert();
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="-translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="-translate-y-full opacity-0"
  >
    <div
      v-if="error"
      class="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-4 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <div class="flex items-center gap-2">
        <TriangleAlertIcon class="size-4 shrink-0" />
        <span>{{ error }}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="size-6 text-destructive hover:bg-destructive/20 hover:text-destructive"
        aria-label="Dismiss error"
        @click="clearError"
      >
        <XIcon class="size-4" />
      </Button>
    </div>
  </Transition>
</template>
