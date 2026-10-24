<script setup lang="ts">
// Imports
import { TriangleAlertIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Spinner } from '~/components/ui/spinner';
import {
  useCreateAgentFromTemplate,
  useGetAgentTemplates,
} from '~/features/agent/composables/useAgentTemplateApi';
import type { Agent } from '~/features/agent/types';

// Emits
const emit = defineEmits<{
  created: [agent: Agent];
}>();

// Composables
const { t } = useI18n();
// This component is only mounted while the workspace has no agents,
// so the template request only runs then.
const { data: templatesData } = useGetAgentTemplates();
const {
  mutate: createFromTemplate,
  isPending,
  variables,
} = useCreateAgentFromTemplate();

// Computed
const templates = computed(() => templatesData.value?.templates ?? []);
const pendingTemplateId = computed(() =>
  isPending.value ? variables.value : null,
);

// Functions
function quickCreate(templateId: string) {
  createFromTemplate(templateId, {
    onSuccess: ({ agent }) => emit('created', agent),
  });
}
</script>

<template>
  <div class="w-full max-w-md space-y-5 text-center">
    <div class="space-y-1">
      <div
        class="flex flex-col items-center gap-2 text-amber-600 dark:text-amber-400"
      >
        <TriangleAlertIcon class="size-6" />
        <p class="text-base font-medium">{{ t('chat.noAgent.title') }}</p>
      </div>
      <p class="text-sm text-muted-foreground">
        {{ t('chat.noAgent.description') }}
      </p>
    </div>
    <Button as-child>
      <NuxtLink to="/agent/create">{{ t('chat.noAgent.create') }}</NuxtLink>
    </Button>
    <template v-if="templates.length > 0">
      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator class="flex-1" />
        <span>{{ t('chat.noAgent.templateDivider') }}</span>
        <Separator class="flex-1" />
      </div>
      <ul class="space-y-2 text-left">
        <li
          v-for="template in templates"
          :key="template.id"
          class="flex items-center gap-3 rounded-lg border bg-card p-3"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ template.name }}</p>
            <p class="line-clamp-2 text-xs text-muted-foreground">
              {{ template.description }}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="isPending"
            @click="quickCreate(template.id)"
          >
            <Spinner v-if="pendingTemplateId === template.id" class="mr-2" />
            {{ t('chat.noAgent.useTemplate') }}
          </Button>
        </li>
      </ul>
    </template>
  </div>
</template>
