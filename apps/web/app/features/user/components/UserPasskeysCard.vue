<script setup lang="ts">
import type { PasskeyRecord } from '@repo/auth/client';
import { toast } from '~/lib/toast';
import UserPasskeyNameDialog from '~/features/user/components/UserPasskeyNameDialog.vue';
import {
  passkeyErrorMessage,
  useAddPasskey,
  useDeletePasskey,
  useGetPasskeys,
  useRenamePasskey,
} from '~/features/user/composables/usePasskeysApi';

// Refs
const addDialogOpen = ref(false);
const renameDialogOpen = ref(false);
const renameTarget = ref<PasskeyRecord | null>(null);

// Composables
const { t } = useI18n();
const supported = useSupportsPasskeys();
const { confirm } = useConfirmDialog();
const { formatDate } = useDateTimeFormat();
const { data: passkeys, isPending, error } = useGetPasskeys();
const { mutateAsync: addPasskey } = useAddPasskey();
const { mutateAsync: renamePasskey } = useRenamePasskey();
const { mutateAsync: deletePasskey } = useDeletePasskey();

// Functions
function displayName(passkey: PasskeyRecord): string {
  return passkey.name || t('user.passkeys.unnamed');
}

async function handleAdd(name: string) {
  await addPasskey(name);
  toast.success(t('user.passkeys.added'));
}

function openRename(passkey: PasskeyRecord) {
  renameTarget.value = passkey;
  renameDialogOpen.value = true;
}

async function handleRename(name: string) {
  if (!renameTarget.value) return;
  await renamePasskey({ id: renameTarget.value.id, name });
  toast.success(t('user.passkeys.renamed'));
}

async function handleDelete(passkey: PasskeyRecord) {
  const confirmed = await confirm({
    title: t('user.passkeys.deleteConfirm.title', {
      name: displayName(passkey),
    }),
    message: t('user.passkeys.deleteConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  try {
    await deletePasskey(passkey.id);
    toast.success(t('user.passkeys.deleted'));
  } catch (err) {
    toast.error(passkeyErrorMessage(err, t('user.passkeys.deleteError')));
  }
}
</script>

<template>
  <SettingsCard class="mx-auto w-full max-w-2xl">
    <CardHeader class="justify-between">
      <div>
        <CardTitle>{{ t('user.passkeys.title') }}</CardTitle>
        <CardDescription>{{ t('user.passkeys.description') }}</CardDescription>
      </div>
      <Button
        v-if="supported && passkeys && passkeys.length > 0"
        leading-icon="hugeicons:add-01"
        size="sm"
        @click="addDialogOpen = true"
      >
        {{ t('user.passkeys.add') }}
      </Button>
    </CardHeader>
    <CardContent>
      <Skeleton v-if="isPending" class="h-16 w-full" />
      <p v-else-if="error" class="text-sm text-destructive">
        {{ t('user.passkeys.loadError') }}
      </p>
      <div
        v-else-if="!passkeys || passkeys.length === 0"
        class="flex flex-col items-start gap-3"
      >
        <p class="text-sm text-muted-foreground">
          {{ t('user.passkeys.empty') }}
        </p>
        <Button
          v-if="supported"
          leading-icon="hugeicons:fingerprint-scan"
          variant="outline"
          size="sm"
          @click="addDialogOpen = true"
        >
          {{ t('user.passkeys.addFirst') }}
        </Button>
        <p v-else class="text-sm text-muted-foreground">
          {{ t('user.passkeys.unsupported') }}
        </p>
      </div>
      <ul v-else class="divide-y">
        <li
          v-for="passkey in passkeys"
          :key="passkey.id"
          class="flex items-center justify-between gap-4 py-3"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">
              {{ displayName(passkey) }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{
                t('user.passkeys.created', {
                  date: formatDate(passkey.createdAt),
                })
              }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              :aria-label="
                t('user.passkeys.renameLabel', { name: displayName(passkey) })
              "
              @click="openRename(passkey)"
            >
              {{ t('user.passkeys.rename') }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              :aria-label="
                t('user.passkeys.deleteLabel', { name: displayName(passkey) })
              "
              @click="handleDelete(passkey)"
            >
              {{ t('common.delete') }}
            </Button>
          </div>
        </li>
      </ul>
    </CardContent>
  </SettingsCard>
  <UserPasskeyNameDialog
    v-model:open="addDialogOpen"
    :title="t('user.passkeys.addTitle')"
    :description="t('user.passkeys.addDescription')"
    :submit-label="t('user.passkeys.add')"
    initial-name=""
    :submit="handleAdd"
  />
  <UserPasskeyNameDialog
    v-model:open="renameDialogOpen"
    :title="t('user.passkeys.renameTitle')"
    :description="t('user.passkeys.renameDescription')"
    :submit-label="t('common.save')"
    :initial-name="renameTarget?.name ?? ''"
    :submit="handleRename"
  />
</template>
