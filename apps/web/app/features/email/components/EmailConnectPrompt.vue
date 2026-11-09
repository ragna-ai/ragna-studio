<script setup lang="ts">
import { MailIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useEmailConnectFlow } from '~/features/email/composables/useEmailConnectFlow';
import type { EmailIntegrationId } from '~/features/email/types';

// The landing state for /mail before a mailbox is connected.
const { t } = useI18n();
const { startConnect, isLinking, isFinishingConnect } = useEmailConnectFlow();

function handleConnect(integrationId: EmailIntegrationId) {
  startConnect(integrationId, '/mail');
}
</script>

<template>
  <div
    class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
  >
    <div class="flex size-16 items-center justify-center rounded-full bg-muted">
      <MailIcon class="size-8 text-muted-foreground" />
    </div>
    <div class="max-w-md space-y-2">
      <h1 class="text-lg font-semibold">{{ t('email.connect.title') }}</h1>
      <p class="text-sm text-muted-foreground">
        {{ t('email.connect.description') }}
      </p>
    </div>
    <div
      v-if="isFinishingConnect"
      class="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner />
      {{ t('email.connect.connecting') }}
    </div>
    <div v-else class="flex gap-2">
      <Button
        :disabled="isLinking"
        :loading="isLinking"
        @click="handleConnect('gmail')"
      >
        <template #leading>
          <Icon name="logos:google-icon" class="size-4" />
        </template>
        {{ t('email.connect.gmailCta') }}
      </Button>
      <Button
        variant="outline"
        :disabled="isLinking"
        :loading="isLinking"
        @click="handleConnect('outlook-mail')"
      >
        <template #leading>
          <Icon name="logos:microsoft-icon" class="size-4" />
        </template>
        {{ t('email.connect.microsoftCta') }}
      </Button>
    </div>
  </div>
</template>
