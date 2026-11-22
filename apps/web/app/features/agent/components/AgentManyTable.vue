<script setup lang="ts">
import AgentMarkWithLock from '~/features/agent/components/AgentMarkWithLock.vue';
import AgentToolIcons from '~/features/agent/components/AgentToolIcons.vue';
import type { Agent } from '~/features/agent/types';

// Imports

interface Props {
  agents: Agent[];
  isLoading: boolean;
}

// Props
defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'delete-agent', agentId: string): void;
}>();

// Composables
const { t } = useI18n();

// Functions
function toolIdsOf(agent: Agent): string[] {
  return agent.toolGrants?.map((grant) => grant.id) ?? [];
}

function agentPath(agent: Agent): string {
  return `/agent/${agent.id}`;
}
</script>

<template>
  <ListTable>
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead>{{ t('agent.list.table.agent') }}</TableHead>
        <TableHead class="w-50">{{ t('agent.list.table.model') }}</TableHead>
        <TableHead class="w-40">{{ t('agent.list.table.tools') }}</TableHead>
        <TableHead class="w-10"
          ><span class="sr-only">{{ t('common.actions') }}</span></TableHead
        >
      </TableRow>
    </TableHeader>
    <TableBody>
      <ListSkeletonRows
        v-if="isLoading"
        :columns="['title', 'bar', 'bar', 'none']"
        tall
      />
      <template v-else>
        <TableRow
          v-for="agent in agents"
          :key="agent.id"
          class="h-14 cursor-pointer"
          @click="navigateTo(agentPath(agent))"
        >
          <TableCell>
            <ListTitleCell
              :title="agent.name"
              :description="agent.description"
              :to="agentPath(agent)"
            >
              <template #lead>
                <AgentMarkWithLock
                  :agent-id="agent.id"
                  :icon="agent.icon"
                  :tone="agent.tone"
                  :image-url="agent.imageUrl"
                  :size="24"
                  :lock="agent.lock"
                />
              </template>
            </ListTitleCell>
          </TableCell>
          <TableCell class="text-small text-muted-foreground">
            {{ agent.aiModel?.displayName }}
          </TableCell>
          <TableCell>
            <AgentToolIcons :tool-ids="toolIdsOf(agent)" />
          </TableCell>
          <TableCell>
            <ListRowActions>
              <DropdownMenuItem as-child>
                <NuxtLinkLocale :to="agentPath(agent)">
                  <Icon name="hugeicons:pencil-edit-02" />
                  {{ t('common.edit') }}
                </NuxtLinkLocale>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <TooltipProvider>
                <Tooltip :disabled="!agent.lock">
                  <TooltipTrigger as-child>
                    <span class="block">
                      <DropdownMenuItem
                        variant="destructive"
                        :disabled="!!agent.lock"
                        @click="emit('delete-agent', agent.id)"
                      >
                        <Icon name="hugeicons:delete-02" />
                        {{ t('common.delete') }}
                        <Icon
                          v-if="agent.lock"
                          name="hugeicons:square-lock-02"
                          class="ml-auto shrink-0 text-muted-foreground"
                        />
                      </DropdownMenuItem>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {{ t('agent.lock.deleteHint') }}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </ListRowActions>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </ListTable>
</template>
