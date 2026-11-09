<script setup lang="ts">
// Imports
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
      :loading="loading"
      @click="emit('click')"
    >
      <template #leading>
        <Icon :name="icon" class="size-4" />
      </template>
      {{ label }}
    </Button>
    <Badge v-if="lastUsed" variant="secondary" class="absolute -top-2 -right-2">
      {{ $t('auth.login.lastUsed') }}
    </Badge>
  </div>
</template>
