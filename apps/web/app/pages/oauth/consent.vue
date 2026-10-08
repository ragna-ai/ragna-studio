<script setup lang="ts">
import {
  isMcpDisabledError,
  useCreateMcpConnection,
  useGetMcpSettings,
} from '~/features/mcp/composables/useMcpApi';
import { MCP_INTEGRATION_IDS } from '~/features/mcp/constants';
import { useGetOAuthClientPublic } from '~/features/mcp/composables/useOAuthClient';
import { clientHost } from '~/features/mcp/lib/oauth-client';
import { useGetWorkspaces } from '~/features/workspace/composables/useWorkspaceApi';
import { extractErrorMessage } from '~/lib/api-error';

definePageMeta({ layout: 'auth' });

// Composables
const { t } = useI18n();
useHead({ title: t('mcp.consent.pageTitle') });

const route = useRoute();
const authClient = useAuth();

const {
  data: settings,
  error: settingsError,
  isPending: isSettingsPending,
} = useGetMcpSettings();
const { data: workspacesData, isPending: isWorkspacesPending } =
  useGetWorkspaces();
const { mutateAsync: createConnection } = useCreateMcpConnection();

// Refs
const selectedWorkspaceId = ref<string>('');
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

// Computed
const clientId = computed(() => {
  const value = route.query.client_id;
  return typeof value === 'string' ? value : null;
});
const { data: clientInfo } = useGetOAuthClientPublic(clientId);
const clientHostname = computed(() =>
  clientId.value ? clientHost(clientId.value) : null,
);
// Host always shown, name is best-effort: the host is what resists phishing.
const clientDisplayLabel = computed(() => {
  const name = clientInfo.value?.client_name;
  return name ? `${name} (${clientHostname.value})` : clientHostname.value;
});
const workspaces = computed(() => workspacesData.value?.workspaces ?? []);
const isMcpUnavailable = computed(
  () =>
    isMcpDisabledError(settingsError.value) ||
    settings.value?.enabled === false,
);
const isPending = computed(
  () => isSettingsPending.value || isWorkspacesPending.value,
);
const isRequestValid = computed(() => clientId.value !== null);

// Hooks
watch(
  workspaces,
  (list) => {
    if (selectedWorkspaceId.value || list.length === 0) return;
    const firstWorkspace = list[0];
    if (firstWorkspace) selectedWorkspaceId.value = firstWorkspace.id;
  },
  { immediate: true },
);

// Functions
async function approve() {
  if (!clientId.value || !selectedWorkspaceId.value) return;
  isSubmitting.value = true;
  errorMessage.value = null;
  try {
    await createConnection({
      clientId: clientId.value,
      workspaceId: selectedWorkspaceId.value,
    });
    const { data, error } = await authClient.oauth2.consent({ accept: true });
    if (error || !data) {
      errorMessage.value = error?.message ?? t('mcp.consent.genericError');
      return;
    }
    window.location.href = data.url;
  } catch (err) {
    errorMessage.value = extractErrorMessage(
      err,
      t('mcp.consent.genericError'),
    );
  } finally {
    isSubmitting.value = false;
  }
}

async function deny() {
  isSubmitting.value = true;
  errorMessage.value = null;
  try {
    const { data, error } = await authClient.oauth2.consent({
      accept: false,
    });
    if (error || !data) {
      errorMessage.value = error?.message ?? t('mcp.consent.genericError');
      return;
    }
    window.location.href = data.url;
  } catch {
    errorMessage.value = t('mcp.consent.genericError');
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col justify-center px-8 py-12 sm:px-16">
    <div class="mx-auto w-full max-w-sm">
      <div class="mb-10">
        <span class="text-2xl font-semibold tracking-tight">RAGNA Studio</span>
      </div>

      <template v-if="isPending">
        <Skeleton class="h-40 w-full" />
      </template>

      <template v-else-if="!isRequestValid">
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ t('mcp.consent.invalidRequest.title') }}
        </h1>
        <p class="mt-2 text-sm text-muted-foreground">
          {{ t('mcp.consent.invalidRequest.message') }}
        </p>
      </template>

      <template v-else-if="isMcpUnavailable">
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ t('mcp.consent.disabled.title') }}
        </h1>
        <p class="mt-2 text-sm text-muted-foreground">
          {{ t('mcp.consent.disabled.message') }}
        </p>
        <Button as-child variant="secondary" class="mt-6">
          <NuxtLink to="/settings/mcp">
            {{ t('mcp.consent.disabled.settingsLink') }}
          </NuxtLink>
        </Button>
        <Button
          variant="ghost"
          class="mt-2 w-full"
          :disabled="isSubmitting"
          @click="deny"
        >
          {{ t('mcp.consent.deny') }}
        </Button>
      </template>

      <template v-else>
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ t('mcp.consent.title') }}
        </h1>
        <p class="mt-2 text-sm text-muted-foreground">
          {{ t('mcp.consent.subtitle', { client: clientDisplayLabel }) }}
        </p>

        <div class="mt-6 space-y-4">
          <div class="space-y-1.5">
            <Label for="mcp-consent-workspace" class="text-sm">
              {{ t('mcp.consent.workspaceLabel') }}
            </Label>
            <Select v-model="selectedWorkspaceId">
              <SelectTrigger id="mcp-consent-workspace" class="w-full">
                <SelectValue
                  :placeholder="t('mcp.consent.workspacePlaceholder')"
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="workspace in workspaces"
                  :key="workspace.id"
                  :value="workspace.id"
                >
                  {{ workspace.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1.5">
            <p class="text-sm font-medium">
              {{ t('mcp.consent.accessLabel') }}
            </p>
            <ul class="space-y-1">
              <li
                v-for="integration in MCP_INTEGRATION_IDS"
                :key="integration"
                class="flex items-center justify-between text-sm text-muted-foreground"
              >
                <span>{{ t(`mcp.integrations.${integration}`) }}</span>
                <span>{{
                  t(`mcp.accessLevel.${settings?.access[integration] ?? 'off'}`)
                }}</span>
              </li>
            </ul>
          </div>
        </div>

        <Alert v-if="errorMessage" variant="destructive" class="mt-6">
          <AlertDescription>{{ errorMessage }}</AlertDescription>
        </Alert>

        <div class="mt-8 flex gap-3">
          <Button
            variant="outline"
            class="flex-1"
            :disabled="isSubmitting"
            @click="deny"
          >
            {{ t('mcp.consent.deny') }}
          </Button>
          <Button
            class="flex-1"
            :disabled="isSubmitting || !selectedWorkspaceId"
            @click="approve"
          >
            {{ t('mcp.consent.approve') }}
          </Button>
        </div>
      </template>
    </div>
  </div>

  <div
    class="hidden bg-stone-900 lg:flex lg:flex-col lg:justify-between lg:p-12"
  >
    <div>
      <span class="text-lg font-semibold text-white">RAGNA Studio</span>
    </div>
    <blockquote class="space-y-2">
      <p class="text-lg leading-relaxed text-stone-100">
        {{ t('mcp.consent.testimonial') }}
      </p>
    </blockquote>
  </div>
</template>
