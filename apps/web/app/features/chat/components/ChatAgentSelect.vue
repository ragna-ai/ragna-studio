<script setup lang="ts">
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
      <button
        type="button"
        role="combobox"
        :aria-expanded="isOpen"
        class="flex h-8 max-w-64 items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden data-[state=open]:bg-surface-subtle"
      >
        <AgentMark
          v-if="selectedAgent"
          :agent-id="selectedAgent.id"
          :size="20"
        />
        <span class="truncate text-small font-medium">
          {{ selectedAgent?.name ?? t('chat.agentSelect.placeholder') }}
        </span>
        <Icon
          name="hugeicons:arrow-down-01"
          class="size-3.5 shrink-0 text-icon"
        />
      </button>
    </PopoverTrigger>
    <!-- 17 = toolbar padding and composer border below the button, so the popover clears the composer -->
    <PopoverContent
      side="bottom"
      align="end"
      :side-offset="17"
      class="w-90 overflow-hidden rounded-lg border bg-popover p-0 shadow-popover"
      @close-auto-focus="onCloseAutoFocus"
    >
      <Command :model-value="selectedAgent?.name ?? ''">
        <CommandInput :placeholder="t('chat.agentSelect.search')" />
        <CommandList class="max-h-84">
          <CommandEmpty class="py-4 text-small text-muted-foreground">
            {{ t('chat.agentSelect.empty') }}
          </CommandEmpty>
          <CommandGroup class="flex flex-col gap-0.5 p-1.5">
            <CommandItem
              v-for="agent in agents"
              :key="agent.id"
              :value="agent.name"
              :class="[
                'h-13 gap-2.5 rounded-md py-0 pr-2.5 pl-2 data-highlighted:bg-surface-subtle data-highlighted:text-foreground',
                agent.id === selectedAgentId && 'bg-surface-subtle',
              ]"
              @select="onSelect(agent.id)"
            >
              <AgentMark :agent-id="agent.id" :size="28" />
              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex min-w-0 items-baseline gap-1.5">
                  <span class="truncate text-body font-medium">
                    {{ agent.name }}
                  </span>
                  <span
                    v-if="agent.aiModel"
                    class="truncate text-caption text-muted-foreground"
                  >
                    {{ agent.aiModel.displayName }}
                  </span>
                </div>
                <span
                  v-if="agent.description"
                  class="truncate text-small text-muted-foreground"
                >
                  {{ agent.description }}
                </span>
              </div>
              <Icon
                v-if="agent.id === selectedAgentId"
                name="hugeicons:tick-02"
                class="size-4 shrink-0 text-foreground"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
