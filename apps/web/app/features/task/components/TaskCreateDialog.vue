<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import { useCreateTask } from '~/features/task/composables/useTaskApi';
import { isTaskStatus, STATUS_COLUMNS } from '~/features/task/lib/task-display';
import { TASK_STATUSES, type TaskStatus } from '~/features/task/types';

// z.enum over the same tuple TaskStatus is derived from (types/index.ts), so
// the schema's output type IS TaskStatus, not a widened `string`.
const createTaskSchema = z.object({
  title: z.string().min(1, { message: 'Title is required.' }),
  status: z.enum(TASK_STATUSES),
});

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { mutateAsync: createTask, isPending } = useCreateTask();
const { t } = useI18n();

const form = useForm({
  defaultValues: { title: '', status: 'backlog' as TaskStatus },
  validators: { onChange: createTaskSchema },
  onSubmit: async ({ value }) => {
    const response = await createTask({
      title: value.title,
      status: value.status,
    });
    open.value = false;
    form.reset();
    await navigateTo(`/tasks/${response.task.id}`);
  },
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('task.createDialog.title') }}</DialogTitle>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent.stop="form.handleSubmit">
        <form.Field name="title">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                {{ t('common.title') }}
              </Label>
              <Input
                :id="field.name"
                autofocus
                :model-value="state.value"
                :placeholder="t('task.createDialog.titlePlaceholder')"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>

        <form.Field name="status">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium">
                {{ t('common.status') }}
              </Label>
              <Select
                :model-value="state.value"
                @update:model-value="(v) => { if (isTaskStatus(v)) field.handleChange(v); }"
              >
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="column in STATUS_COLUMNS" :key="column.value" :value="column.value">
                    {{ t(column.labelKey) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </template>
        </form.Field>

        <DialogFooter>
          <Button type="button" variant="secondary" @click="open = false">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="isPending">
            <Spinner v-if="isPending" class="mr-2" />
            {{ t('common.create') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
