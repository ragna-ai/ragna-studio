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

const { state, onConfirm, onCancel } = useConfirmDialog();
</script>

<template>
  <AlertDialog :open="state.open" @update:open="(v) => !v && onCancel()">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ state.options.title }}</AlertDialogTitle>
        <AlertDialogDescription
          class="text-sm text-stone-800"
          v-if="state.options.message"
        >
          {{ state.options.message }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button variant="outline" @click="onCancel">
          {{ state.options.cancelLabel ?? 'Cancel' }}
        </Button>
        <Button
          :variant="state.options.variant ?? 'default'"
          @click="onConfirm"
        >
          {{ state.options.confirmLabel ?? 'Confirm' }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
