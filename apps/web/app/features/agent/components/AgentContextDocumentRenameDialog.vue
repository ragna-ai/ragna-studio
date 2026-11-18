<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import { toast } from '~/lib/toast';
import { useRenameAgentContextDocument } from '~/features/agent/composables/useAgentApi';
import type { AgentContextDocument } from '~/features/agent/types';

// Props
interface Props {
  agentId: string;
  /** The document to rename; the dialog does nothing while it's `null`. */
  document: AgentContextDocument | null;
}
const props = defineProps<Props>();

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { mutateAsync: renameDocument, isPending } =
  useRenameAgentContextDocument();
const { t } = useI18n();

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: t('common.nameRequired') })
    .max(255),
});

const form = useForm({
  defaultValues: { name: props.document?.name ?? '' },
  validators: { onChange: nameSchema },
  onSubmit: async ({ value }) => {
    if (!props.document) {
      return;
    }
    const name = value.name.trim();
    if (name !== props.document.name) {
      await renameDocument({
        agentId: props.agentId,
        documentId: props.document.id,
        name,
      });
      toast.success(t('agent.context.renamed'));
    }
    open.value = false;
  },
});

// Hooks
watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }
  form.reset({ name: props.document?.name ?? '' });
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('agent.context.renameDialog.title') }}</DialogTitle>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent.stop="form.handleSubmit">
        <form.Field name="name">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                {{ t('common.name') }}
              </Label>
              <Input
                :id="field.name"
                autofocus
                :model-value="state.value"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :field="field" />
            </div>
          </template>
        </form.Field>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="isPending" :loading="isPending">
            {{ t('common.save') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
