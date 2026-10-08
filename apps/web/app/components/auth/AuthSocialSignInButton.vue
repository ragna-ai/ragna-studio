<script setup lang="ts">
// Imports
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoaderCircleIcon } from '@lucide/vue';

// Props
interface SocialSignInButtonProps {
  icon: string;
  label: string;
  loading: boolean;
  disabled: boolean;
  lastUsed?: boolean;
}
withDefaults(defineProps<SocialSignInButtonProps>(), {
  lastUsed: false,
});

// Emits
const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <div class="relative">
    <Button
      variant="outline"
      class="w-full"
      :disabled="disabled"
      @click="emit('click')"
    >
      <Icon v-if="!loading" :name="icon" class="h-4 w-4" />
      <LoaderCircleIcon v-else class="h-4 w-4 animate-spin" />
      {{ label }}
    </Button>
    <Badge v-if="lastUsed" variant="secondary" class="absolute -top-2 -right-2">
      {{ $t('auth.login.lastUsed') }}
    </Badge>
  </div>
</template>
