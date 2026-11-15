<script setup lang="ts">
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Props
interface PasskeySignInButtonProps {
  disabled: boolean;
  lastUsed?: boolean;
}
withDefaults(defineProps<PasskeySignInButtonProps>(), { lastUsed: false });

// Emits
interface PasskeySignInEmits {
  /** Fired when the sign-in failed; `code` is the server error code when there is one. */
  (event: 'error', code: string | null): void;
  (event: 'busy', busy: boolean): void;
}
const emit = defineEmits<PasskeySignInEmits>();

// Refs
const loading = ref(false);

// Composables
const authClient = useAuth();
const supported = useSupportsPasskeys();
const { resolveSignInTarget } = useSignInRedirect();

// Functions
function setLoading(value: boolean) {
  loading.value = value;
  emit('busy', value);
}

async function signIn() {
  setLoading(true);
  try {
    const { error } = await authClient.signIn.passkey();
    if (error) {
      emit('error', error.code ?? null);
      setLoading(false);
      return;
    }
    // The MCP target lives on the API origin, so this is a full navigation.
    window.location.assign(resolveSignInTarget());
  } catch {
    emit('error', null);
    setLoading(false);
  }
}
</script>

<template>
  <div v-if="supported" class="relative">
    <Button
      variant="outline"
      class="w-full"
      :disabled="disabled || loading"
      :loading="loading"
      @click="signIn"
    >
      <template #leading>
        <Icon name="hugeicons:fingerprint-scan" class="size-4" />
      </template>
      {{ $t('auth.login.passkey') }}
    </Button>
    <Badge v-if="lastUsed" variant="secondary" class="absolute -top-2 -right-2">
      {{ $t('auth.login.lastUsed') }}
    </Badge>
  </div>
</template>
