<script setup lang="ts">
import type { OrganizationAssignableRole } from '@repo/auth/client';
import { useForm } from '@tanstack/vue-form';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import {
  organizationErrorMessage,
  useInviteMember,
} from '~/features/organization/composables/useOrganizationApi';
import { ASSIGNABLE_ROLES } from '~/features/organization/types';

// Refs
const open = defineModel<boolean>('open', { required: true });
const serverError = ref<string | null>(null);

// Composables
const { t } = useI18n();
const { mutateAsync: inviteMember } = useInviteMember();

const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(ASSIGNABLE_ROLES),
});

const form = useForm({
  defaultValues: { email: '', role: 'member' as OrganizationAssignableRole },
  validators: { onChange: inviteSchema },
  onSubmit: async ({ value }) => {
    serverError.value = null;
    try {
      await inviteMember({ email: value.email.trim(), role: value.role });
      toast.success(t('organization.invitations.sent'));
      form.reset();
      open.value = false;
    } catch (error) {
      serverError.value = organizationErrorMessage(
        error,
        t('organization.invitations.sendError'),
      );
    }
  },
});

watch(open, (isOpen) => {
  if (!isOpen) serverError.value = null;
});
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{
          t('organization.invitations.inviteTitle')
        }}</DialogTitle>
        <DialogDescription>{{
          t('organization.invitations.inviteDescription')
        }}</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent.stop="form.handleSubmit">
        <form.Field name="email">
          <template #default="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                {{ t('organization.invitations.email') }}
              </Label>
              <Input
                :id="field.name"
                type="email"
                :model-value="state.value"
                @update:model-value="
                  (v: string | number) => field.handleChange(String(v))
                "
                @blur="field.handleBlur"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>
        <form.Field name="role">
          <template #default="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium">
                {{ t('organization.invitations.role') }}
              </Label>
              <Select
                :model-value="state.value"
                @update:model-value="
                  (v) => field.handleChange(v as OrganizationAssignableRole)
                "
              >
                <SelectTrigger class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="role in ASSIGNABLE_ROLES"
                    :key="role"
                    :value="role"
                  >
                    {{ t(`organization.roles.${role}`) }}
                  </SelectItem>
                </SelectContent>
              </Select>
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
                {{ t('organization.invitations.send') }}
              </Button>
            </template>
          </form.Subscribe>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
