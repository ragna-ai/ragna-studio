<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const { t } = useI18n();
const { state, onConfirm, onCancel } = useConfirmDialog();
</script>

<template>
  <AlertDialog :open="state.open" @update:open="(v) => !v && onCancel()">
    <AlertDialogContent class="z-51">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ state.options.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="state.options.message">
          {{ state.options.message }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button variant="outline" @click="onCancel">
          {{ state.options.cancelLabel ?? t('common.cancel') }}
        </Button>
        <Button
          :variant="state.options.variant ?? 'default'"
          @click="onConfirm"
        >
          {{ state.options.confirmLabel ?? t('common.confirm') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
