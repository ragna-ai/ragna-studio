<script setup lang="ts">
// Imports
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import { useStartIntegrationConnect } from '~/features/integrations/composables/useIntegrationApi';

// Composables
const { t } = useI18n();
const route = useRoute();
const { mutate: startConnect, isPending } = useStartIntegrationConnect();

// Functions
function connectLinkedIn() {
  startConnect({
    integrationId: 'linkedin-posting',
    returnPath: route.fullPath,
  });
}
</script>

<template>
  <Alert>
    <AlertTitle>{{ t('social.linkedinHint.title') }}</AlertTitle>
    <AlertDescription>
      <span>{{ t('social.linkedinHint.message') }}</span>
      <Button
        size="sm"
        variant="outline"
        class="mt-2 block"
        :disabled="isPending"
        @click="connectLinkedIn"
      >
        {{ t('social.linkedinHint.connect') }}
      </Button>
    </AlertDescription>
  </Alert>
</template>
