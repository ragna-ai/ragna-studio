<script setup lang="ts">
import { useGetOrganizationMembers } from '~/features/organization/composables/useOrganizationApi';
import type { OrganizationMember } from '~/features/organization/types';

interface WorkspaceMemberPickerProps {
  // Org members that are already in the workspace or must not be offered.
  excludedUserIds?: readonly string[];
}

// Props
const props = withDefaults(defineProps<WorkspaceMemberPickerProps>(), {
  excludedUserIds: () => [],
});

// Refs
const selectedUserIds = defineModel<string[]>({ default: () => [] });

// Composables
const { t } = useI18n();
const session = useAuthSession();
const {
  data: organizationMembers,
  isPending,
  error,
} = useGetOrganizationMembers();

// Computed
const candidates = computed(() =>
  (organizationMembers.value ?? []).filter(isCandidate),
);

// Functions
function isCandidate(member: OrganizationMember): boolean {
  if (member.user.deletedAt) return false;
  if (member.userId === session.value?.user.id) return false;
  return !props.excludedUserIds.includes(member.userId);
}

function toggle(userId: string, checked: boolean) {
  selectedUserIds.value = checked
    ? [...selectedUserIds.value, userId]
    : selectedUserIds.value.filter((id) => id !== userId);
}
</script>

<template>
  <Skeleton v-if="isPending" class="h-20 w-full" />
  <p v-else-if="error" class="text-sm text-destructive">
    {{ t('workspace.members.loadError') }}
  </p>
  <p v-else-if="candidates.length === 0" class="text-sm text-muted-foreground">
    {{ t('workspace.members.noCandidates') }}
  </p>
  <ul v-else class="max-h-48 space-y-1 overflow-y-auto">
    <li v-for="member in candidates" :key="member.userId">
      <label
        class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-50"
      >
        <Checkbox
          :model-value="selectedUserIds.includes(member.userId)"
          @update:model-value="
            (checked) => toggle(member.userId, checked === true)
          "
        />
        <span class="min-w-0">
          <span class="block truncate text-sm">{{ member.user.name }}</span>
          <span class="block truncate text-xs text-muted-foreground">{{
            member.user.email
          }}</span>
        </span>
      </label>
    </li>
  </ul>
</template>
