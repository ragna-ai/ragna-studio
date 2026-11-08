<script setup lang="ts">
import { useSidePanelStore } from '~/stores/sidepanel.store';

const sidePanel = useSidePanelStore();
const isOpen = computed(() => sidePanel.view === 'chat-history');
</script>

<template>
  <button
    type="button"
    :aria-pressed="isOpen"
    class="flex h-8 shrink-0 items-center gap-1.5 rounded-md pr-3 pl-2.5 text-body font-medium text-muted-foreground hover:bg-surface-subtle"
    :class="{ 'bg-surface-subtle': isOpen }"
    @click.stop="sidePanel.toggle('chat-history')"
  >
    <Icon name="hugeicons:clock-01" class="size-4 text-icon" />
    {{ $t('chat.history.button') }}
  </button>
</template>
