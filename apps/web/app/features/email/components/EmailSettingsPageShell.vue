<script setup lang="ts">
import EmailPrivateWorkspaceGate from '~/features/email/components/EmailPrivateWorkspaceGate.vue';
import { useGetEmailAccount } from '~/features/email/composables/useEmailAccountApi';
import type { EmailAccount } from '~/features/email/types';

interface EmailSettingsPageShellProps {
  title: string;
}

defineProps<EmailSettingsPageShellProps>();

defineSlots<{
  default(props: { account: EmailAccount }): unknown;
}>();

const { data } = useGetEmailAccount();
const account = computed(() => data.value?.account ?? null);
</script>

<template>
  <EmailPrivateWorkspaceGate>
    <SectionWrapper>
      <Heading>
        <template #top>
          <HeadingTitle
            :title="title"
            :subtitle="$t('email.settings.subtitle')"
          />
        </template>
      </Heading>
      <div v-if="account" class="space-y-6 px-page pt-6 pb-10">
        <slot :account="account" />
      </div>
      <p v-else class="px-page text-sm text-muted-foreground">
        {{ $t('email.settings.notConnected') }}
      </p>
    </SectionWrapper>
  </EmailPrivateWorkspaceGate>
</template>
