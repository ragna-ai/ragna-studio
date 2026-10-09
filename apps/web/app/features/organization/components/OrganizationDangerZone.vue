<script setup lang="ts">
import { toast } from 'vue-sonner';
import {
  organizationErrorMessage,
  useDeleteOrganization,
} from '~/features/organization/composables/useOrganizationApi';

// Props
const props = defineProps<{
  organizationName: string;
}>();

// Refs
const dialogOpen = ref(false);
const typedName = ref('');

// Composables
const { t } = useI18n();
const { mutateAsync: deleteOrganization, isPending } = useDeleteOrganization();

// Computed
const nameMatches = computed(
  () => typedName.value.trim() === props.organizationName,
);

// Functions
async function handleDelete() {
  if (!nameMatches.value) return;
  try {
    await deleteOrganization(undefined);
    dialogOpen.value = false;
  } catch (error) {
    toast.error(
      organizationErrorMessage(error, t('organization.danger.error')),
    );
  }
}

watch(dialogOpen, (isOpen) => {
  if (!isOpen) typedName.value = '';
});
</script>

<template>
  <Card class="mx-auto w-full max-w-3xl border-destructive/50">
    <CardHeader>
      <CardTitle class="text-destructive">{{
        t('organization.danger.title')
      }}</CardTitle>
    </CardHeader>
    <CardContent class="flex items-center justify-between gap-4">
      <p class="text-sm text-muted-foreground">
        {{ t('organization.danger.description') }}
      </p>
      <Button variant="destructive" class="shrink-0" @click="dialogOpen = true">
        {{ t('organization.danger.action') }}
      </Button>
    </CardContent>
  </Card>

  <Dialog v-model:open="dialogOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('organization.danger.confirm.title') }}</DialogTitle>
        <DialogDescription>{{
          t('organization.danger.confirm.message')
        }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-2">
        <Label for="organization-name-confirm">
          {{
            t('organization.danger.confirm.typeName', {
              name: organizationName,
            })
          }}
        </Label>
        <Input
          id="organization-name-confirm"
          v-model="typedName"
          autocomplete="off"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" @click="dialogOpen = false">{{
          t('common.cancel')
        }}</Button>
        <Button
          variant="destructive"
          :disabled="!nameMatches || isPending"
          @click="handleDelete"
        >
          {{ t('organization.danger.confirm.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
