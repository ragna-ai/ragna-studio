<script setup lang="ts">
// Imports
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Spinner } from '~/components/ui/spinner';
import type { SocialProviderId } from '~/features/user/composables/useUserSocialAccounts';
import useUserSocialAccounts from '~/features/user/composables/useUserSocialAccounts';

// Props
// Emits

// Refs
interface SocialProvider {
  id: SocialProviderId;
  icon: string;
}

const providers: SocialProvider[] = [
  { id: 'google', icon: 'logos:google-icon' },
  { id: 'microsoft', icon: 'logos:microsoft-icon' },
  { id: 'linkedin', icon: 'logos:linkedin-icon' },
];

// Composables
const {
  accounts,
  isLoading,
  isError,
  connect,
  connectingProvider,
  disconnect,
  disconnectingAccountId,
} = useUserSocialAccounts();

// Computed
const providerRows = computed(() =>
  providers.map((provider) => ({
    provider,
    account: accounts.value.find((account) => account.providerId === provider.id),
  })),
);

// Functions
function handleConnect(providerId: SocialProviderId) {
  connect(providerId);
}

function handleDisconnect(providerId: SocialProviderId, accountId: string) {
  disconnect({ providerId, accountId });
}

// Hooks
</script>

<template>
  <Card class="mx-auto mt-10 w-full max-w-2xl">
    <CardHeader>
      <CardTitle>{{ $t('user.social.title') }}</CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="isLoading" class="flex justify-center py-8">
        <Spinner />
      </div>
      <p v-else-if="isError" class="py-8 text-center text-sm text-destructive">
        {{ $t('user.social.loadError') }}
      </p>
      <ul v-else class="divide-y">
        <li
          v-for="row in providerRows"
          :key="row.provider.id"
          class="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
        >
          <div class="flex items-center gap-3">
            <Icon :name="row.provider.icon" class="size-6 shrink-0" />
            <div>
              <p class="text-sm font-medium">
                {{ $t(`user.social.providers.${row.provider.id}`) }}
              </p>
              <Badge :variant="row.account ? 'secondary' : 'outline'">
                {{
                  row.account
                    ? $t('user.social.connected')
                    : $t('user.social.notConnected')
                }}
              </Badge>
            </div>
          </div>

          <Button
            v-if="row.account"
            variant="outline"
            :disabled="disconnectingAccountId === row.account.accountId"
            @click="handleDisconnect(row.provider.id, row.account.accountId)"
          >
            {{ $t('user.social.disconnect') }}
          </Button>
          <Button
            v-else
            variant="outline"
            :disabled="connectingProvider === row.provider.id"
            @click="handleConnect(row.provider.id)"
          >
            {{ $t('user.social.connect') }}
          </Button>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
