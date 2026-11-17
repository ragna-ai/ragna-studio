<script setup lang="ts">
// Imports
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';

export interface DatasetSettingsValue {
  name: string;
  description: string;
}

// Props
interface DatasetSettingsSheetProps {
  name: string;
  description: string;
  isSaving: boolean;
}

const props = defineProps<DatasetSettingsSheetProps>();

// Emits
const emit = defineEmits<{
  (e: 'save', value: DatasetSettingsValue): void;
}>();

// Refs
const open = defineModel<boolean>('open', { required: true });

// Composables
const { t } = useI18n();

const settingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: t('common.nameRequired') })
    .max(255),
  description: z.string().trim().max(1000),
});

const form = useForm({
  defaultValues: { name: props.name, description: props.description },
  validators: { onChange: settingsSchema },
  onSubmit: ({ value }) => {
    emit('save', {
      name: value.name.trim(),
      description: value.description.trim(),
    });
  },
});

// Hooks
// Every opening starts from the saved values, so a cancelled edit never reappears.
watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }
  form.reset({ name: props.name, description: props.description });
});
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" class="gap-0 p-0">
      <SheetHeader>
        <SheetTitle>{{ t('dataset.detail.settings') }}</SheetTitle>
        <SheetDescription class="sr-only">
          {{ t('dataset.detail.settings') }}
        </SheetDescription>
      </SheetHeader>
      <form
        class="flex min-h-0 flex-1 flex-col"
        @submit.prevent.stop="form.handleSubmit"
      >
        <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          <form.Field name="name">
            <template v-slot="{ field, state }">
              <div class="space-y-2">
                <Label :for="field.name">{{ t('common.name') }}</Label>
                <Input
                  :id="field.name"
                  :model-value="state.value"
                  autocomplete="off"
                  @update:model-value="(v) => field.handleChange(String(v))"
                  @blur="field.handleBlur"
                />
                <FormFieldInfo :field="field" />
              </div>
            </template>
          </form.Field>
          <form.Field name="description">
            <template v-slot="{ field, state }">
              <div class="space-y-2">
                <Label :for="field.name">{{ t('common.description') }}</Label>
                <Textarea
                  :id="field.name"
                  :model-value="state.value"
                  class="min-h-24"
                  :placeholder="t('dataset.detail.descriptionPlaceholder')"
                  @update:model-value="(v) => field.handleChange(String(v))"
                  @blur="field.handleBlur"
                />
                <FormFieldInfo :field="field" />
              </div>
            </template>
          </form.Field>
        </div>
        <SheetFooter class="justify-end">
          <Button type="button" variant="outline" @click="open = false">
            {{ t('common.cancel') }}
          </Button>
          <form.Subscribe>
            <template v-slot="{ canSubmit }">
              <Button type="submit" :disabled="!canSubmit" :loading="isSaving">
                {{ t('common.save') }}
              </Button>
            </template>
          </form.Subscribe>
        </SheetFooter>
      </form>
    </SheetContent>
  </Sheet>
</template>
