<script setup lang="ts">
import OrganizationRestrictedWorkspaceRow from '~/features/organization/components/OrganizationRestrictedWorkspaceRow.vue';
import { useGetRestrictedWorkspaces } from '~/features/organization/composables/useOrganizationApi';

// Composables
const { t } = useI18n();
const { data, isPending, error } = useGetRestrictedWorkspaces(true);
</script>

<template>
  <Card class="mx-auto w-full max-w-3xl">
    <CardHeader>
      <CardTitle>{{ t('organization.workspaces.title') }}</CardTitle>
      <CardDescription>
        {{ t('organization.workspaces.description') }}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="isPending" class="h-16 w-full" />
      <p v-else-if="error" class="text-sm text-destructive">
        {{ t('organization.workspaces.loadError') }}
      </p>
      <p
        v-else-if="data?.workspaces.length === 0"
        class="text-sm text-muted-foreground"
      >
        {{ t('organization.workspaces.empty') }}
      </p>
      <ul v-else class="divide-y">
        <OrganizationRestrictedWorkspaceRow
          v-for="workspace in data?.workspaces"
          :key="workspace.id"
          :workspace="workspace"
        />
      </ul>
    </CardContent>
  </Card>
</template>
