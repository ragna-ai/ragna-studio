<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { storeToRefs } from 'pinia';
import { z } from 'zod';
import type { DatasetColumn } from '~/features/dataset/types';
import { useCreateDataset } from '~/features/dataset/composables/useDatasetApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

type DatasetPreset = 'empty' | 'taskTracker';

const TASK_TRACKER_COLUMNS: DatasetColumn[] = [
  { id: 'task', name: 'Task', type: 'text' },
  { id: 'instructions', name: 'Instructions', type: 'text' },
  { id: 'status', name: 'Status', type: 'select', options: ['todo', 'in progress', 'done'] },
];

const datasetCreateSchema = z.object({
  name: z.string().min(1, { message: 'Name is required.' }),
  description: z.string(),
});

// Refs
const preset = ref<DatasetPreset>('empty');

// Composables
// A workspace is always active (docs/api-standards/prd.md): activeWorkspaceId
// is only briefly '' on first load, before the workspace list resolves it.
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { isPending, mutateAsync } = useCreateDataset(activeWorkspaceId);
const { t } = useI18n();

useHead({
  title: t('dataset.create.title'),
});

const breadcrumbItems = computed(() => [
  { label: t('dataset.list.title'), to: '/dataset' },
  { label: t('dataset.create.title') },
]);

const form = useForm({
  defaultValues: {
    name: '',
    description: '',
  },
  validators: {
    onChange: datasetCreateSchema,
  },
  onSubmit: async ({ value }) => {
    const columns = preset.value === 'taskTracker' ? TASK_TRACKER_COLUMNS : [];
    const response = await mutateAsync({
      name: value.name,
      description: value.description || undefined,
      columns,
    });
    await navigateTo(`/dataset/${response.dataset.id}`);
  },
});
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle :title="t('dataset.create.title')" :subtitle="t('dataset.create.subtitle')">
          <template #title>
            <PageBreadcrumb :items="breadcrumbItems" />
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-10">
      <form class="max-w-lg space-y-6" @submit.prevent.stop="form.handleSubmit">
        <div>
          <Label class="mb-2 block text-sm font-medium">
            {{ t('dataset.create.presetLabel') }}
          </Label>
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              class="rounded-lg border p-4 text-left transition-colors"
              :class="preset === 'empty' ? 'border-primary bg-accent' : 'hover:bg-accent/50'"
              @click="preset = 'empty'"
            >
              <p class="text-sm font-semibold">{{ t('dataset.create.preset.empty.title') }}</p>
              <p class="text-xs text-muted-foreground">
                {{ t('dataset.create.preset.empty.description') }}
              </p>
            </button>
            <button
              type="button"
              class="rounded-lg border p-4 text-left transition-colors"
              :class="preset === 'taskTracker' ? 'border-primary bg-accent' : 'hover:bg-accent/50'"
              @click="preset = 'taskTracker'"
            >
              <p class="text-sm font-semibold">
                {{ t('dataset.create.preset.taskTracker.title') }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ t('dataset.create.preset.taskTracker.description') }}
              </p>
            </button>
          </div>
        </div>

        <form.Field name="name">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                {{ t('dataset.create.nameLabel') }}
              </Label>
              <Input
                :id="field.name"
                :model-value="state.value"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>

        <form.Field name="description">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                {{ t('dataset.create.descriptionLabel') }}
              </Label>
              <Textarea
                :id="field.name"
                rows="3"
                :model-value="state.value"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>

        <div class="flex justify-end gap-4">
          <Button as-child variant="secondary">
            <NuxtLinkLocale to="/dataset">{{ t('dataset.create.cancel') }}</NuxtLinkLocale>
          </Button>
          <Button type="submit" :disabled="isPending">
            <Spinner v-if="isPending" class="mr-2" />
            {{ t('dataset.create.submit') }}
          </Button>
        </div>
      </form>
    </div>
  </SectionWrapper>
</template>
