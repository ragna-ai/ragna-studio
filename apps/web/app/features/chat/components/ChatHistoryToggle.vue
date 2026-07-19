<script setup lang="ts">
import { HistoryIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { useSidePanelStore } from '~/stores/sidepanel.store';

// Composables
const sidePanel = useSidePanelStore();
const { t } = useI18n();
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    :aria-label="t('chat.history.toggle')"
    :title="t('chat.history.toggle')"
    @click.stop="sidePanel.toggle('chat-history')"
  >
    <HistoryIcon class="size-4 stroke-1.5 opacity-75" />
  </Button>
</template>
