<script setup lang="ts">
import { toast } from 'vue-sonner';
import {
  organizationErrorMessage,
  useGetOrganizationMembers,
  useTransferOwnership,
} from '~/features/organization/composables/useOrganizationApi';
import { hasRole, OWNER_ROLE } from '~/features/organization/lib/roles';

// Refs
const selectedMemberId = ref<string | null>(null);

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { data: members } = useGetOrganizationMembers();
const { mutateAsync: transferOwnership, isPending } = useTransferOwnership();

// Computed
const candidates = computed(() =>
  (members.value ?? []).filter(
    (member) => !member.user.deletedAt && !hasRole(member.role, OWNER_ROLE),
  ),
);
const selectedMember = computed(() =>
  candidates.value.find((member) => member.id === selectedMemberId.value),
);

// Functions
async function handleTransfer() {
  const target = selectedMember.value;
  if (!target) return;
  const confirmed = await confirm({
    title: t('organization.transfer.confirm.title', { name: target.user.name }),
    message: t('organization.transfer.confirm.message'),
    confirmLabel: t('organization.transfer.confirm.confirm'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  try {
    await transferOwnership(target.id);
    selectedMemberId.value = null;
    toast.success(t('organization.transfer.done'));
  } catch (error) {
    toast.error(
      organizationErrorMessage(error, t('organization.transfer.error')),
    );
  }
}
</script>

<template>
  <Card class="mx-auto w-full max-w-3xl">
    <CardHeader>
      <CardTitle>{{ t('organization.transfer.title') }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      <p class="text-sm text-muted-foreground">
        {{ t('organization.transfer.description') }}
      </p>
      <p v-if="candidates.length === 0" class="text-sm text-muted-foreground">
        {{ t('organization.transfer.noCandidates') }}
      </p>
      <div v-else class="flex items-center gap-2">
        <Select v-model="selectedMemberId">
          <SelectTrigger class="w-72">
            <SelectValue
              :placeholder="t('organization.transfer.placeholder')"
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="member in candidates"
              :key="member.id"
              :value="member.id"
            >
              {{ member.user.name }} ({{ member.user.email }})
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="destructive"
          :disabled="!selectedMember || isPending"
          @click="handleTransfer"
        >
          {{ t('organization.transfer.action') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
