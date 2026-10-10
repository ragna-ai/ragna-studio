<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import WorkspaceMemberPicker from '~/features/workspace/components/WorkspaceMemberPicker.vue';
import { useCreateWorkspace } from '~/features/workspace/composables/useWorkspaceApi';
import { primaryIdSchema } from '~/lib/schema';
import type { CreateWorkspaceInput } from '~/features/workspace/types';

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, { message: 'Name is required.' }),
  visibility: z.enum(['organization', 'restricted']),
  memberUserIds: z.array(primaryIdSchema),
});

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { mutateAsync: createWorkspace, isPending } = useCreateWorkspace();
const { t } = useI18n();

const form = useForm({
  defaultValues: {
    name: '',
    visibility: 'restricted' as CreateWorkspaceInput['visibility'],
    memberUserIds: [] as string[],
  },
  validators: { onChange: createWorkspaceSchema },
  onSubmit: async ({ value }) => {
    await createWorkspace({
      name: value.name.trim(),
      visibility: value.visibility,
      memberUserIds:
        value.visibility === 'restricted' ? value.memberUserIds : undefined,
    });
    form.reset();
    open.value = false;
  },
});

const visibility = form.useStore((state) => state.values.visibility);

// Functions
function isCreateVisibility(
  value: unknown,
): value is CreateWorkspaceInput['visibility'] {
  return value === 'organization' || value === 'restricted';
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('workspace.create.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('workspace.create.description') }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent.stop="form.handleSubmit">
        <form.Field name="name">
          <template v-slot="{ field, state }">
            <div class="space-y-1.5">
              <Label :for="field.name">{{ t('workspace.create.name') }}</Label>
              <Input
                :id="field.name"
                :model-value="state.value"
                :placeholder="t('workspace.manage.namePlaceholder')"
                autocomplete="off"
                @update:model-value="(v) => field.handleChange(String(v))"
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>

        <form.Field name="visibility">
          <template v-slot="{ field, state }">
            <div class="space-y-1.5">
              <Label>{{ t('workspace.create.visibility') }}</Label>
              <Select
                :model-value="state.value"
                @update:model-value="
                  (v) => isCreateVisibility(v) && field.handleChange(v)
                "
              >
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restricted">
                    {{ t('workspace.visibility.restricted') }}
                  </SelectItem>
                  <SelectItem value="organization">
                    {{ t('workspace.visibility.organization') }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p class="text-xs text-muted-foreground">
                {{
                  state.value === 'restricted'
                    ? t('workspace.create.restrictedHint')
                    : t('workspace.create.organizationHint')
                }}
              </p>
            </div>
          </template>
        </form.Field>

        <form.Field v-if="visibility === 'restricted'" name="memberUserIds">
          <template v-slot="{ field, state }">
            <div class="space-y-1.5">
              <Label>{{ t('workspace.create.members') }}</Label>
              <WorkspaceMemberPicker
                :model-value="state.value"
                @update:model-value="(ids) => field.handleChange(ids)"
              />
            </div>
          </template>
        </form.Field>

        <DialogFooter>
          <Button type="button" variant="secondary" @click="open = false">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="isPending">
            <Spinner v-if="isPending" class="mr-2" />
            {{ t('workspace.create.submit') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
