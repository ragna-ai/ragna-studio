<script setup lang="ts">
import WorkflowSchedulePausedBadge from '~/features/workflow/components/WorkflowSchedulePausedBadge.vue';
import type { Workflow } from '~/features/workflow/types';

interface Props {
  workflows: Workflow[];
  isLoading: boolean;
}

// Props
defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'delete-workflow', workflowId: string): void;
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Functions
function workflowPath(workflow: Workflow): string {
  return `/workflow/${workflow.id}`;
}
</script>

<template>
  <ListTable>
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead>{{ t('common.name') }}</TableHead>
        <TableHead class="w-70">{{ t('common.status') }}</TableHead>
        <TableHead class="w-45">{{ t('common.updated') }}</TableHead>
        <TableHead class="w-10">
          <span class="sr-only">{{ t('common.actions') }}</span>
        </TableHead>
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
          v-for="workflow in workflows"
          :key="workflow.id"
          class="h-14 cursor-pointer"
          @click="navigateTo(workflowPath(workflow))"
        >
          <TableCell>
            <ListTitleCell
              :title="workflow.name"
              :description="workflow.description ?? undefined"
              :to="workflowPath(workflow)"
            >
              <template #lead>
                <Icon
                  name="hugeicons:workflow-square-10"
                  class="size-4 text-icon"
                />
              </template>
            </ListTitleCell>
          </TableCell>
          <TableCell>
            <div class="flex min-w-0 items-center gap-1.5">
              <Badge
                class="shrink-0"
                :variant="
                  workflow.publishedDefinition ? 'default' : 'secondary'
                "
              >
                {{
                  workflow.publishedDefinition
                    ? t('workflow.list.status.published')
                    : t('workflow.list.status.draft')
                }}
              </Badge>
              <TooltipProvider v-if="workflow.scheduleCron">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Badge variant="outline" class="min-w-0 gap-1">
                      <Icon name="hugeicons:clock-01" class="size-3 shrink-0" />
                      <span class="truncate">{{ workflow.scheduleCron }}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {{
                        t('workflow.list.scheduled', {
                          cron: workflow.scheduleCron,
                          timezone: workflow.scheduleTimezone,
                        })
                      }}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <WorkflowSchedulePausedBadge
                v-if="workflow.schedulePaused"
                class="shrink-0"
              />
            </div>
          </TableCell>
          <TableCell class="text-small text-muted-foreground">
            {{ formatDateTime(workflow.updatedAt) }}
          </TableCell>
          <TableCell>
            <ListRowActions>
              <DropdownMenuItem as-child>
                <NuxtLinkLocale :to="workflowPath(workflow)">
                  <Icon name="hugeicons:pencil-edit-02" />
                  {{ t('common.edit') }}
                </NuxtLinkLocale>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="emit('delete-workflow', workflow.id)"
              >
                <Icon name="hugeicons:delete-02" />
                {{ t('common.delete') }}
              </DropdownMenuItem>
            </ListRowActions>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </ListTable>
</template>
