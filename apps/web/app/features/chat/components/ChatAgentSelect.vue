<script setup lang="ts">
// Imports
import { CheckIcon } from '@lucide/vue';
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
import type { ChatAgentOption } from '~/features/chat/types';

// Props
interface Props {
  agents: ChatAgentOption[];
  selectedAgentId: string | null;
  disabled?: boolean;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  select: [agentId: string];
}>();

// Refs
const isOpen = ref(false);

// Composables
const { t } = useI18n();

// Computed
const selectedAgent = computed(() =>
  props.agents.find((agent) => agent.id === props.selectedAgentId),
);

// Functions
function onSelect(agentId: string) {
  emit('select', agentId);
  isOpen.value = false;
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        role="combobox"
        :aria-expanded="isOpen"
        :disabled="disabled"
        class="h-6 max-w-64 gap-1.5 px-2 text-xs font-normal"
      >
        <span class="truncate text-foreground">
          {{ selectedAgent?.name ?? t('chat.agentSelect.placeholder') }}
        </span>
        <span
          v-if="selectedAgent?.aiModel"
          class="truncate text-muted-foreground"
        >
          {{ selectedAgent.aiModel.displayName }}
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-80 overflow-hidden rounded-xl p-0">
      <Command>
        <CommandInput :placeholder="t('chat.agentSelect.search')" />
        <CommandList>
          <CommandEmpty>{{ t('chat.agentSelect.empty') }}</CommandEmpty>
          <CommandGroup>
            <CommandItem
              v-for="agent in agents"
              :key="agent.id"
              :value="agent.name"
              @select="onSelect(agent.id)"
            >
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate text-sm">{{ agent.name }}</span>
                <span
                  v-if="agent.description"
                  class="line-clamp-2 text-xs text-muted-foreground"
                >
                  {{ agent.description }}
                </span>
              </div>
              <CheckIcon
                v-if="agent.id === selectedAgentId"
                class="ml-auto size-4 shrink-0 text-primary"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
