<script setup lang="ts">
import { toast } from 'vue-sonner';
import {
  organizationErrorMessage,
  useRestoreOrganization,
} from '~/features/organization/composables/useOrganizationApi';
import { finalDeletionDate } from '~/features/organization/lib/removal';
import { OWNER_ROLE, hasRole } from '~/features/organization/lib/roles';

// Props
const props = defineProps<{
  organizationName: string;
  role: string;
  deletedAt: string;
}>();

// Composables
const { t } = useI18n();
const { formatDate } = useDateTimeFormat();
const { mutateAsync: restoreOrganization, isPending } =
  useRestoreOrganization();

// Computed
const canRestore = computed(() => hasRole(props.role, OWNER_ROLE));

// Functions
async function handleRestore() {
  try {
    await restoreOrganization(undefined);
    toast.success(t('organization.deleted.restored'));
  } catch (error) {
    toast.error(
      organizationErrorMessage(error, t('organization.deleted.restoreError')),
    );
  }
}

async function signOut() {
  await useAuth().signOut();
  await navigateTo('/auth/login');
}
</script>

<template>
  <div class="flex h-screen items-center justify-center p-6">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>{{
          t('organization.deleted.title', { name: organizationName })
        }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-muted-foreground">
          {{
            t('organization.deleted.description', {
              date: formatDate(finalDeletionDate(deletedAt)),
            })
          }}
        </p>
        <p v-if="!canRestore" class="text-sm text-muted-foreground">
          {{ t('organization.deleted.ownerOnly') }}
        </p>
        <div class="flex gap-2">
          <Button
            v-if="canRestore"
            :disabled="isPending"
            @click="handleRestore"
          >
            {{ t('organization.deleted.restore') }}
          </Button>
          <Button variant="outline" @click="signOut">{{
            t('nav.userMenu.signOut')
          }}</Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
