<script setup lang="ts">
import { Button } from '~/components/ui/button';
import AgentVersionSheet from '~/features/agent/components/AgentVersionSheet.vue';

interface Props {
  agentId: string;
}

// Props
const props = defineProps<Props>();

// Refs
const versionsOpen = ref(false);

// Composables
const { t } = useI18n();
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="text-icon"
        :aria-label="t('nav.topBar.moreActions')"
      >
        <Icon name="hugeicons:more-horizontal" class="size-4 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @click="versionsOpen = true">
        <Icon name="hugeicons:clock-04" class="shrink-0" />
        {{ t('agent.lock.actions.versions') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <AgentVersionSheet v-model:open="versionsOpen" :agent-id="props.agentId" />
</template>
