<script setup lang="ts">
import type { OrganizationInvitationRecord } from '@repo/auth/client';
import { CopyIcon, UserPlusIcon, XIcon } from '@lucide/vue';
import { toast } from 'vue-sonner';
import OrganizationInviteDialog from '~/features/organization/components/OrganizationInviteDialog.vue';
import {
  organizationErrorMessage,
  useCancelInvitation,
  useGetOrganizationInvitations,
} from '~/features/organization/composables/useOrganizationApi';
import { buildInvitationLink } from '~/features/organization/lib/invitation-link';

// Refs
const inviteDialogOpen = ref(false);

// Composables
const { t } = useI18n();
const { copy } = useClipboard();
const { formatDateTime } = useDateTimeFormat();
const {
  data: invitations,
  isPending,
  error,
} = useGetOrganizationInvitations(true);
const { mutateAsync: cancelInvitation } = useCancelInvitation();

// Functions
function isOpenInvitation(invitation: OrganizationInvitationRecord): boolean {
  return (
    invitation.status === 'pending' &&
    new Date(invitation.expiresAt) > new Date()
  );
}

// Computed
const pendingInvitations = computed(() =>
  (invitations.value ?? []).filter(isOpenInvitation),
);

function copyLink(invitation: OrganizationInvitationRecord) {
  copy(buildInvitationLink(invitation.id));
  toast.success(t('organization.invitations.linkCopied'));
}

async function handleCancel(invitation: OrganizationInvitationRecord) {
  try {
    await cancelInvitation(invitation.id);
    toast.success(t('organization.invitations.canceled'));
  } catch (err) {
    toast.error(
      organizationErrorMessage(err, t('organization.invitations.cancelError')),
    );
  }
}
</script>

<template>
  <Card class="mx-auto w-full max-w-3xl">
    <CardHeader class="flex flex-row items-center justify-between">
      <CardTitle>{{ t('organization.invitations.title') }}</CardTitle>
      <Button size="sm" @click="inviteDialogOpen = true">
        <UserPlusIcon class="mr-1 size-4" />
        {{ t('organization.invitations.invite') }}
      </Button>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="isPending" class="h-16 w-full" />
      <p v-else-if="error" class="text-sm text-destructive">
        {{ t('organization.invitations.loadError') }}
      </p>
      <p
        v-else-if="pendingInvitations.length === 0"
        class="text-sm text-muted-foreground"
      >
        {{ t('organization.invitations.empty') }}
      </p>
      <ul v-else class="divide-y">
        <li
          v-for="invitation in pendingInvitations"
          :key="invitation.id"
          class="flex items-center justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ invitation.email }}</p>
            <p class="text-xs text-muted-foreground">
              {{ t(`organization.roles.${invitation.role}`) }},
              {{
                t('organization.invitations.expires', {
                  date: formatDateTime(invitation.expiresAt),
                })
              }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" @click="copyLink(invitation)">
              <CopyIcon class="mr-1 size-4" />
              {{ t('organization.invitations.copyLink') }}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('organization.invitations.cancel')"
              @click="handleCancel(invitation)"
            >
              <XIcon class="size-4" />
            </Button>
          </div>
        </li>
      </ul>
    </CardContent>
  </Card>
  <OrganizationInviteDialog v-model:open="inviteDialogOpen" />
</template>
