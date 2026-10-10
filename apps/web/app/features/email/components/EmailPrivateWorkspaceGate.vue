<script setup lang="ts">
import { UserLockIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { usePersonalWorkspace } from '~/features/workspace/composables/usePersonalWorkspace';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

/**
 * Renders the mail UI only while the private workspace is active.
 * Otherwise shows a hint with an explicit switch button (no auto-switch).
 */

// Composables
const { t } = useI18n();
const { selectWorkspace } = useWorkspaceScopeStore();
const { personalWorkspaceId, isPersonalActive, isLoading } =
  usePersonalWorkspace();

// Functions
function switchToPersonalWorkspace() {
  selectWorkspace(personalWorkspaceId.value);
}
</script>

<template>
  <slot v-if="isPersonalActive" />
  <div
    v-else-if="!isLoading"
    class="flex h-full flex-col items-center justify-center gap-3 p-10 text-center"
  >
    <UserLockIcon class="size-8 text-muted-foreground" />
    <h2 class="text-lg font-semibold">
      {{ t('email.privateWorkspace.title') }}
    </h2>
    <p class="max-w-md text-sm text-muted-foreground">
      {{ t('email.privateWorkspace.description') }}
    </p>
    <Button v-if="personalWorkspaceId" @click="switchToPersonalWorkspace">
      {{ t('email.privateWorkspace.switch') }}
    </Button>
  </div>
</template>
