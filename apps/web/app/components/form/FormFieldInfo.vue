<script setup lang="ts">
import { useStore, type AnyFieldApi } from '@tanstack/vue-form';
import { fieldMessageId, isFieldErrorVisible } from './field-error';

type FormFieldInfoProps = {
  field: AnyFieldApi;
  hint?: string;
};

// Props
const props = defineProps<FormFieldInfoProps>();

// Composables
const submissionAttempts = useStore(
  props.field.form.store,
  (state) => state.submissionAttempts,
);

// Functions
function errorMessages(): string[] {
  const messages = props.field.state.meta.errors.map(
    (error: { message?: string } | string) =>
      typeof error === 'string' ? error : (error.message ?? ''),
  );
  return [...new Set<string>(messages)].filter(Boolean);
}
</script>

<template>
  <div
    :id="fieldMessageId(field)"
    class="flex flex-col gap-1 not-empty:pt-2 empty:hidden"
  >
    <template v-if="isFieldErrorVisible(field, submissionAttempts)">
      <p
        v-for="message of errorMessages()"
        :key="message"
        class="flex gap-1.5 text-sm text-destructive"
      >
        <Icon name="hugeicons:alert-02" class="mt-0.5 size-4 shrink-0" />
        {{ message }}
      </p>
    </template>
    <p v-else-if="hint" class="text-sm text-muted-foreground">{{ hint }}</p>
    <span
      v-if="field.state.meta.isValidating"
      class="text-xs text-muted-foreground"
    >
      {{ $t('common.validating') }}
    </span>
  </div>
</template>
