<script setup lang="ts">
import PickerRow from '~/components/PickerRow.vue';
import { Button } from '~/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import AgentMark from '~/features/agent/components/AgentMark.vue';
import type { ChatAgentOption } from '~/features/chat/types';

interface ChatAgentSelectProps {
  agents: ChatAgentOption[];
  selectedAgentId: string | null;
  disabled?: boolean;
}

const props = defineProps<ChatAgentSelectProps>();

const emit = defineEmits<{
  select: [agentId: string];
}>();

const isOpen = ref(false);

const { t } = useI18n();

const selectedAgent = computed(() =>
  props.agents.find((agent) => agent.id === props.selectedAgentId),
);

let hasPicked = false;

function onSelect(agentId: string) {
  hasPicked = true;
  emit('select', agentId);
  isOpen.value = false;
}

// After a pick the parent moves focus to the message box; don't pull it back to the trigger.
function onCloseAutoFocus(event: Event) {
  if (!hasPicked) return;
  hasPicked = false;
  event.preventDefault();
}
</script>

<template>
  <div v-if="disabled" class="flex h-8 max-w-64 items-center gap-1.5 px-2">
    <AgentMark v-if="selectedAgent" :agent-id="selectedAgent.id" :size="20" />
    <span class="truncate text-small font-medium">
      {{ selectedAgent?.name ?? t('chat.agentSelect.placeholder') }}
    </span>
  </div>
  <Popover v-else v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        role="combobox"
        trailing-icon="hugeicons:arrow-down-01"
        :aria-expanded="isOpen"
        class="max-w-64 px-2"
      >
        <template v-if="selectedAgent" #leading>
          <AgentMark :agent-id="selectedAgent.id" :size="20" />
        </template>
        <span class="truncate text-small font-medium">
          {{ selectedAgent?.name ?? t('chat.agentSelect.placeholder') }}
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent
      side="bottom"
      align="end"
      :side-offset="17"
      class="w-90 overflow-hidden p-0"
      @close-auto-focus="onCloseAutoFocus"
    >
      <Command :model-value="selectedAgent?.name ?? ''">
        <CommandInput :placeholder="t('chat.agentSelect.search')" />
        <CommandList class="max-h-84">
          <CommandEmpty>
            {{ t('chat.agentSelect.empty') }}
          </CommandEmpty>
          <CommandGroup class="flex flex-col gap-0.5">
            <CommandItem
              v-for="agent in agents"
              :key="agent.id"
              :value="agent.name"
              @select="onSelect(agent.id)"
            >
              <PickerRow
                :title="agent.name"
                :hint="agent.description"
                :selected="agent.id === selectedAgentId"
              >
                <template #lead>
                  <AgentMark :agent-id="agent.id" :size="24" />
                </template>
              </PickerRow>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
