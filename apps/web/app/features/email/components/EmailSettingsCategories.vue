<script setup lang="ts">
import { PlusIcon, Trash2Icon } from '@lucide/vue';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Switch } from '~/components/ui/switch';
import { Textarea } from '~/components/ui/textarea';
import {
  useCreateEmailCategory,
  useDeleteEmailCategory,
  useGetEmailCategories,
  useUpdateEmailCategory,
} from '~/features/email/composables/useEmailCategoryApi';

// Categories steer the auto-classifier (`description` is fed to the
// classifier prompt as-is), so each row's description is an
// editable free-text field, not just a label.
const DEFAULT_COLOR = '#78716c';

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { data } = useGetEmailCategories();
const { mutate: createCategory, isPending: isCreating } = useCreateEmailCategory();
const { mutate: updateCategory } = useUpdateEmailCategory();
const { mutate: deleteCategory } = useDeleteEmailCategory();

// Refs
const newName = ref('');
const newColor = ref(DEFAULT_COLOR);
const descriptionDrafts = ref<Record<string, string>>({});

// Computed
const categories = computed(() => data.value?.categories ?? []);

// Functions
function descriptionFor(categoryId: string, fallback: string): string {
  return descriptionDrafts.value[categoryId] ?? fallback;
}

const saveDescription = useDebounceFn((categoryId: string, description: string) => {
  updateCategory({ categoryId, description });
}, 600);

function handleDescriptionInput(categoryId: string, value: string) {
  descriptionDrafts.value = { ...descriptionDrafts.value, [categoryId]: value };
  saveDescription(categoryId, value);
}

function handleCreate() {
  const name = newName.value.trim();
  if (!name) return;
  createCategory({ name, color: newColor.value }, { onSuccess: () => (newName.value = '') });
}

async function handleDelete(categoryId: string, name: string) {
  const confirmed = await confirm({
    title: t('email.settings.categories.deleteConfirmTitle'),
    message: t('email.settings.categories.deleteConfirmMessage', { name }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  deleteCategory(categoryId);
}
</script>

<template>
  <Card class="mx-auto w-full max-w-2xl">
    <CardHeader>
      <CardTitle>{{ t('email.settings.categories.title') }}</CardTitle>
      <p class="text-sm text-muted-foreground">{{ t('email.settings.categories.subtitle') }}</p>
    </CardHeader>
    <CardContent class="space-y-4">
      <form class="flex items-center gap-2" @submit.prevent="handleCreate">
        <input
          v-model="newColor"
          type="color"
          class="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-input"
          :aria-label="t('email.settings.categories.colorLabel')"
        />
        <Input
          v-model="newName"
          class="flex-1"
          :placeholder="t('email.settings.categories.namePlaceholder')"
          autocomplete="off"
        />
        <Button type="submit" size="icon" :disabled="isCreating">
          <Spinner v-if="isCreating" />
          <PlusIcon v-else class="size-4" />
        </Button>
      </form>

      <Separator v-if="categories.length > 0" />

      <ul v-if="categories.length > 0" class="space-y-4">
        <li v-for="category in categories" :key="category.id" class="space-y-2 rounded-md border p-3">
          <div class="flex items-center gap-2">
            <span class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: category.color }" />
            <span class="flex-1 text-sm font-medium">{{ category.name }}</span>
            <div class="flex items-center gap-2">
              <Switch
                :id="`autodraft-${category.id}`"
                :model-value="category.autoDraft"
                @update:model-value="(value) => updateCategory({ categoryId: category.id, autoDraft: value })"
              />
              <Label :for="`autodraft-${category.id}`" class="text-xs">
                {{ t('email.settings.categories.autoDraft') }}
              </Label>
            </div>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('common.delete')"
              @click="handleDelete(category.id, category.name)"
            >
              <Trash2Icon class="size-4 text-destructive" />
            </Button>
          </div>
          <Textarea
            :model-value="descriptionFor(category.id, category.description)"
            :placeholder="t('email.settings.categories.descriptionPlaceholder')"
            rows="2"
            class="text-sm"
            @update:model-value="(v) => handleDescriptionInput(category.id, String(v))"
          />
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">{{ t('email.settings.categories.empty') }}</p>
    </CardContent>
  </Card>
</template>
