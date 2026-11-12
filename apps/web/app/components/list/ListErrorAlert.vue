<script setup lang="ts">
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '~/components/ui/alert';
import { Button } from '~/components/ui/button';

interface ListErrorAlertProps {
  title: string;
  description: string;
}

defineProps<ListErrorAlertProps>();

const emit = defineEmits<{
  (e: 'retry'): void;
}>();

const { t } = useI18n();
</script>

<template>
  <Alert variant="destructive">
    <Icon name="hugeicons:alert-circle" data-slot="alert-icon" />
    <AlertTitle>{{ title }}</AlertTitle>
    <AlertDescription>{{ description }}</AlertDescription>
    <AlertAction>
      <Button variant="outline" size="sm" @click="emit('retry')">
        {{ t('common.tryAgain') }}
      </Button>
    </AlertAction>
  </Alert>
</template>
