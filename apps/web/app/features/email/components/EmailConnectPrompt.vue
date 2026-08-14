<script setup lang="ts">
import { MailIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useEmailConnectFlow } from '~/features/email/composables/useEmailConnectFlow';

// The landing state for /mail before Gmail is connected
// (docs/email/prd.md, "Auth and account connection"): explains the feature
// and starts the linkSocial() -> POST /email/account/connect flow.
const { t } = useI18n();
const { startConnect, isLinking, isFinishingConnect } = useEmailConnectFlow();

const isBusy = computed(() => isLinking.value || isFinishingConnect.value);

function handleConnect() {
  startConnect('/mail');
}
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
    <div class="flex size-16 items-center justify-center rounded-full bg-muted">
      <MailIcon class="size-8 text-muted-foreground" />
    </div>
    <div class="max-w-md space-y-2">
      <h1 class="text-lg font-semibold">{{ t('email.connect.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('email.connect.description') }}</p>
    </div>
    <Button :disabled="isBusy" @click="handleConnect">
      <Spinner v-if="isBusy" class="mr-2" />
      {{ t('email.connect.cta') }}
    </Button>
  </div>
</template>
