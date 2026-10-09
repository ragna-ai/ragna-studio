<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import {
  organizationErrorMessage,
  useRenameOrganization,
} from '~/features/organization/composables/useOrganizationApi';

// Props
const props = defineProps<{
  name: string;
  canEdit: boolean;
}>();

// Composables
const { t } = useI18n();
const { mutateAsync: renameOrganization, isPending } = useRenameOrganization();

const nameSchema = z.object({ name: z.string().trim().min(1).max(100) });

const form = useForm({
  defaultValues: { name: props.name },
  validators: { onChange: nameSchema },
  onSubmit: async ({ value }) => {
    try {
      await renameOrganization(value.name.trim());
      toast.success(t('organization.name.saved'));
    } catch (error) {
      toast.error(
        organizationErrorMessage(error, t('organization.name.saveError')),
      );
    }
  },
});
</script>

<template>
  <Card class="mx-auto w-full max-w-3xl">
    <CardHeader>
      <CardTitle>{{ t('organization.name.title') }}</CardTitle>
    </CardHeader>
    <CardContent>
      <form
        class="flex items-start gap-2"
        @submit.prevent.stop="form.handleSubmit"
      >
        <form.Field name="name">
          <template #default="{ field, state }">
            <div class="grow">
              <Label class="sr-only" :for="field.name">{{
                t('common.name')
              }}</Label>
              <Input
                :id="field.name"
                :model-value="state.value"
                :disabled="!canEdit"
                @update:model-value="
                  (v: string | number) => field.handleChange(String(v))
                "
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>
        <Button v-if="canEdit" type="submit" :disabled="isPending">
          {{ t('common.save') }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
