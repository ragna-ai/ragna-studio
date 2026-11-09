<script setup lang="ts">
import { Toggle } from '~/components/ui/toggle';
import { useSidePanelStore } from '~/stores/sidepanel.store';

const sidePanel = useSidePanelStore();
const isOpen = computed(() => sidePanel.view === 'chat-history');
</script>

<template>
  <Toggle
    :model-value="isOpen"
    class="text-muted-foreground"
    @click.stop="sidePanel.toggle('chat-history')"
  >
    <Icon name="hugeicons:clock-01" class="size-4 text-icon" />
    {{ $t('chat.history.button') }}
  </Toggle>
</template>
