<script setup lang="ts">
import PickerRow from '~/components/PickerRow.vue';
import AgentMark from '~/features/agent/components/AgentMark.vue';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import TaskPropertyButton from '~/features/task/components/TaskPropertyButton.vue';

// Models
const agentId = defineModel<string | null>({ required: true });

// Refs
const isOpen = ref(false);

// Composables
const { t } = useI18n();
const { data } = useGetAllAgents();

// Computed
const agents = computed(() => data.value?.agents ?? []);
const selectedAgent = computed(() =>
  agents.value.find((agent) => agent.id === agentId.value),
);

// Functions
function select(id: string | null) {
  agentId.value = id;
  isOpen.value = false;
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <TaskPropertyButton
        :label="selectedAgent?.name ?? t('task.property.assignee')"
        :is-set="!!selectedAgent"
      >
        <template #leading>
          <AgentMark
            v-if="selectedAgent"
            :agent-id="selectedAgent.id"
            :icon="selectedAgent.icon"
            :tone="selectedAgent.tone"
            :image-url="selectedAgent.imageUrl"
            :size="16"
          />
          <Icon
            v-else
            name="hugeicons:user-circle"
            class="size-3.5 text-icon"
            aria-hidden="true"
          />
        </template>
      </TaskPropertyButton>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-64 overflow-hidden p-0">
      <Command
        :model-value="selectedAgent?.name ?? t('task.property.unassigned')"
      >
        <CommandInput :placeholder="t('task.property.searchAgents')" />
        <CommandList class="max-h-64">
          <CommandEmpty>{{ t('task.property.noAgents') }}</CommandEmpty>
          <CommandGroup class="flex flex-col gap-0.5">
            <CommandItem
              :value="t('task.property.unassigned')"
              @select="select(null)"
            >
              <PickerRow
                :title="t('task.property.unassigned')"
                :selected="!selectedAgent"
              >
                <template #lead>
                  <Icon
                    name="hugeicons:user-circle"
                    class="size-4 text-icon"
                    aria-hidden="true"
                  />
                </template>
              </PickerRow>
            </CommandItem>
            <CommandItem
              v-for="agent in agents"
              :key="agent.id"
              :value="agent.name"
              @select="select(agent.id)"
            >
              <PickerRow :title="agent.name" :selected="agent.id === agentId">
                <template #lead>
                  <AgentMark
                    :agent-id="agent.id"
                    :icon="agent.icon"
                    :tone="agent.tone"
                    :image-url="agent.imageUrl"
                    :size="16"
                  />
                </template>
              </PickerRow>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
