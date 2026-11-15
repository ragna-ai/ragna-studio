<script setup lang="ts">
import { passkeyNameSchema } from '@repo/auth/client';
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';

// Props
interface PasskeyNameDialogProps {
  title: string;
  description: string;
  submitLabel: string;
  initialName: string;
  /** Resolves when saved (the dialog closes); throws to show the message. */
  submit: (name: string) => Promise<void>;
}
const props = defineProps<PasskeyNameDialogProps>();

// Refs
const open = defineModel<boolean>('open', { required: true });
const serverError = ref<string | null>(null);

// Composables
const { t } = useI18n();
// The profile form on the same page already owns the id "name".
const nameInputId = useId();

const nameSchema = z.object({ name: passkeyNameSchema });

const form = useForm({
  defaultValues: { name: props.initialName },
  validators: { onChange: nameSchema },
  onSubmit: async ({ value }) => {
    serverError.value = null;
    try {
      await props.submit(value.name.trim());
      open.value = false;
    } catch (error) {
      serverError.value =
        error instanceof Error && error.message
          ? error.message
          : t('signIn.passkeys.requestFailed');
    }
  },
});

watch(open, (isOpen) => {
  serverError.value = null;
  if (isOpen) form.reset({ name: props.initialName });
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent.stop="form.handleSubmit">
        <form.Field name="name">
          <template #default="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="nameInputId">
                {{ t('common.name') }}
              </Label>
              <Input
                :id="nameInputId"
                :model-value="state.value"
                :placeholder="t('signIn.passkeys.namePlaceholder')"
                @update:model-value="
                  (v: string | number) => field.handleChange(String(v))
                "
                @blur="field.handleBlur"
              />
              <FormFieldInfo :field="field" />
            </div>
          </template>
        </form.Field>
        <Alert v-if="serverError" variant="destructive">
          <AlertDescription>{{ serverError }}</AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            {{ t('common.cancel') }}
          </Button>
          <form.Subscribe>
            <template #default="{ isSubmitting }">
              <Button type="submit" :disabled="isSubmitting">
                {{ submitLabel }}
              </Button>
            </template>
          </form.Subscribe>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
