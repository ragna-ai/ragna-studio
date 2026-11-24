<script setup lang="ts">
import AgentMark from '~/features/agent/components/AgentMark.vue';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import TaskRunWorkingIndicator from '~/features/task/components/TaskRunWorkingIndicator.vue';
import {
  useCancelTaskRun,
  useStartTaskRun,
} from '~/features/task/composables/useTaskRunApi';
import type { TaskWithDetails } from '~/features/task/types';

interface TaskRunControlsProps {
  task: TaskWithDetails;
}

// Props
const props = defineProps<TaskRunControlsProps>();

// Composables
const { t } = useI18n();
const { data: agentsData } = useGetAllAgents();
const { mutate: startRun, isPending: isStarting } = useStartTaskRun();
const { mutate: cancelRun, isPending: isStopping } = useCancelTaskRun();

// Computed
const agents = computed(() => agentsData.value?.agents ?? []);

// Functions
function start(agentId?: string) {
  startRun({ taskId: props.task.id, agentId });
}

function stop() {
  const { activeRun } = props.task;
  if (!activeRun) {
    return;
  }
  cancelRun({ taskId: props.task.id, runId: activeRun.id });
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <template v-if="task.activeRun && task.assignedAgent">
      <TaskRunWorkingIndicator
        :agent-id="task.assignedAgent.id"
        :agent-name="task.assignedAgent.name"
      />
      <Button
        variant="outline"
        leading-icon="hugeicons:stop"
        :loading="isStopping"
        :disabled="isStopping"
        @click="stop"
      >
        {{ t('task.run.stop') }}
      </Button>
      <p class="text-xs text-muted-foreground">
        {{ t('task.run.lockedHint') }}
      </p>
    </template>
    <Button
      v-else-if="task.assignedAgent"
      leading-icon="hugeicons:play"
      :loading="isStarting"
      :disabled="isStarting"
      @click="start()"
    >
      {{ t('task.run.start') }}
    </Button>
    <DropdownMenu v-else-if="agents.length > 0">
      <DropdownMenuTrigger as-child>
        <Button
          variant="outline"
          leading-icon="hugeicons:play"
          :disabled="isStarting"
        >
          {{ t('task.run.assignAndStart') }}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          v-for="agent in agents"
          :key="agent.id"
          @select="start(agent.id)"
        >
          <AgentMark
            :agent-id="agent.id"
            :icon="agent.icon"
            :tone="agent.tone"
            :image-url="agent.imageUrl"
            :size="16"
          />
          {{ agent.name }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
