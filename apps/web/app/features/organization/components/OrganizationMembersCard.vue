<script setup lang="ts">
import type { OrganizationAssignableRole } from '@repo/auth/client';
import { RotateCcwIcon, Trash2Icon } from '@lucide/vue';
import { toast } from 'vue-sonner';
import {
  organizationErrorMessage,
  useGetOrganizationMembers,
  useRemoveMember,
  useRestoreMember,
  useUpdateMemberRole,
} from '~/features/organization/composables/useOrganizationApi';
import { finalDeletionDate } from '~/features/organization/lib/removal';
import {
  ADMIN_ROLE,
  hasRole,
  OWNER_ROLE,
} from '~/features/organization/lib/roles';
import {
  ASSIGNABLE_ROLES,
  type OrganizationMember,
} from '~/features/organization/types';

// Props
defineProps<{
  canManage: boolean;
}>();

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { formatDate } = useDateTimeFormat();
const { data: members, isPending, error } = useGetOrganizationMembers();
const { mutateAsync: updateRole } = useUpdateMemberRole();
const { mutateAsync: removeMember } = useRemoveMember();
const { mutateAsync: restoreMember } = useRestoreMember();

// Functions
function isOwnerRow(member: OrganizationMember): boolean {
  return hasRole(member.role, OWNER_ROLE);
}

function isRemoved(member: OrganizationMember): boolean {
  return Boolean(member.user.deletedAt);
}

function roleLabel(role: string): string {
  if (hasRole(role, OWNER_ROLE)) return t('organization.roles.owner');
  if (hasRole(role, ADMIN_ROLE)) return t('organization.roles.admin');
  return t('organization.roles.member');
}

async function changeRole(
  member: OrganizationMember,
  role: OrganizationAssignableRole,
) {
  try {
    await updateRole({ memberId: member.id, role });
    toast.success(t('organization.members.roleChanged'));
  } catch (err) {
    toast.error(
      organizationErrorMessage(err, t('organization.members.roleError')),
    );
  }
}

async function handleRemove(member: OrganizationMember) {
  const confirmed = await confirm({
    title: t('organization.members.removeConfirm.title', {
      name: member.user.name,
    }),
    message: t('organization.members.removeConfirm.message'),
    confirmLabel: t('organization.members.remove'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  try {
    await removeMember(member.id);
    toast.success(t('organization.members.removed'));
  } catch (err) {
    toast.error(
      organizationErrorMessage(err, t('organization.members.removeError')),
    );
  }
}

async function handleRestore(member: OrganizationMember) {
  try {
    await restoreMember(member.id);
    toast.success(t('organization.members.restored'));
  } catch (err) {
    toast.error(
      organizationErrorMessage(err, t('organization.members.restoreError')),
    );
  }
}
</script>

<template>
  <Card class="mx-auto w-full max-w-3xl">
    <CardHeader>
      <CardTitle>{{ t('organization.members.title') }}</CardTitle>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="isPending" class="h-24 w-full" />
      <p v-else-if="error" class="text-sm text-destructive">
        {{ t('organization.members.loadError') }}
      </p>
      <ul v-else class="divide-y">
        <li
          v-for="member in members"
          :key="member.id"
          class="flex items-center justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ member.user.name }}</p>
            <p class="truncate text-xs text-muted-foreground">
              {{ member.user.email }}
            </p>
            <p
              v-if="isRemoved(member) && member.user.deletedAt"
              class="text-xs text-muted-foreground"
            >
              {{
                t('organization.members.deletedOn', {
                  date: formatDate(finalDeletionDate(member.user.deletedAt)),
                })
              }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Badge v-if="isRemoved(member)" variant="destructive">
              {{ t('organization.members.removedBadge') }}
            </Badge>
            <Select
              v-else-if="canManage && !isOwnerRow(member)"
              :model-value="member.role"
              @update:model-value="
                (role) => changeRole(member, role as OrganizationAssignableRole)
              "
            >
              <SelectTrigger class="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="role in ASSIGNABLE_ROLES"
                  :key="role"
                  :value="role"
                >
                  {{ roleLabel(role) }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Badge v-else variant="secondary">{{
              roleLabel(member.role)
            }}</Badge>

            <template v-if="canManage && !isOwnerRow(member)">
              <Button
                v-if="isRemoved(member)"
                variant="outline"
                size="sm"
                @click="handleRestore(member)"
              >
                <RotateCcwIcon class="mr-1 size-4" />
                {{ t('organization.members.restore') }}
              </Button>
              <Button
                v-else
                variant="ghost"
                size="icon"
                :aria-label="t('organization.members.remove')"
                @click="handleRemove(member)"
              >
                <Trash2Icon class="size-4" />
              </Button>
            </template>
          </div>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
