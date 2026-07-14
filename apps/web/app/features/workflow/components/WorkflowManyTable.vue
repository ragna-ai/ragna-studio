<script setup lang="ts">
import { ClockIcon, SettingsIcon, Trash2Icon, WorkflowIcon } from '@lucide/vue';
import type { Workflow } from '~/features/workflow/types';

// Imports

interface Props {
  workflows: Workflow[];
  meta?: { totalCount: number };
}

// Props
defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'delete-workflow', workflowId: string): void;
}>();

// Refs

// Composables
const { t } = useI18n();

// Computed

// Functions
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDateTime(isoDate: string) {
  return dateTimeFormatter.format(new Date(isoDate));
}

// Hooks
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>&nbsp;</TableHead>
        <TableHead>Name</TableHead>
        <TableHead>Description</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Updated</TableHead>
        <TableHead class="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="workflows.length === 0" :colspan="6">
        No workflows yet.
      </TableEmpty>
      <TableRow
        v-for="workflow in workflows"
        :key="workflow.id"
        class="cursor-pointer"
        @click="navigateTo(`/workflow/${workflow.id}`)"
      >
        <TableCell class="w-12">
          <WorkflowIcon class="size-4 stroke-1.5" />
        </TableCell>
        <TableCell>
          <div class="text-sm font-semibold">
            {{ workflow.name }}
          </div>
        </TableCell>
        <TableCell class="max-w-80 truncate text-sm text-muted-foreground">
          {{ workflow.description || '—' }}
        </TableCell>
        <TableCell>
          <div class="flex items-center gap-1.5">
            <Badge :variant="workflow.publishedDefinition ? 'default' : 'secondary'">
              {{ workflow.publishedDefinition ? 'Published' : 'Draft' }}
            </Badge>
            <TooltipProvider v-if="workflow.scheduleCron">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Badge variant="outline" class="gap-1">
                    <ClockIcon class="size-3" />
                    {{ workflow.scheduleCron }}
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
          </div>
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ formatDateTime(workflow.updatedAt) }}
        </TableCell>
        <TableCell
          class="space-x-2 text-right whitespace-nowrap"
          @click.stop
        >
          <Button as-child variant="outline" size="icon">
            <NuxtLinkLocale :to="`/workflow/${workflow.id}`">
              <SettingsIcon class="size-4 stroke-1.5 text-primary" />
            </NuxtLinkLocale>
          </Button>
          <Button
            variant="outline"
            size="icon"
            @click="() => emit('delete-workflow', workflow.id)"
          >
            <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
          </Button>
        </TableCell>
      </TableRow>
    </TableBody>
    <TableMetaCaption :itemsLength="workflows.length" :meta="meta" />
  </Table>
</template>
