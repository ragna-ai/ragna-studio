<script setup lang="ts">
// Imports
import { toast } from '~/lib/toast';
import AgentContextDocumentRenameDialog from '~/features/agent/components/AgentContextDocumentRenameDialog.vue';
import {
  AGENT_CONTEXT_DOCUMENT_ACCEPT,
  AGENT_CONTEXT_DOCUMENT_MAX_FILE_BYTES,
  AGENT_CONTEXT_DOCUMENT_MAX_FILES,
  useDeleteAgentContextDocument,
  useGetAgentContextDocuments,
  useReplaceAgentContextDocumentFile,
  useRetryAgentContextDocument,
  useUploadAgentContextDocuments,
} from '~/features/agent/composables/useAgentApi';
import type {
  AgentContextDocument,
  AgentContextDocumentStatus,
} from '~/features/agent/types';
import Status, { type StatusTone } from '~/components/status/Status.vue';

const STATUS_TONE: Record<AgentContextDocumentStatus, StatusTone> = {
  ready: 'ok',
  pending: 'pending',
  failed: 'danger',
};

type AgentContextDocumentPanelProps = {
  agentId: string;
  /** Hides everything that changes the files, renaming included. */ readonly?: boolean;
};

// Props
const props = withDefaults(defineProps<AgentContextDocumentPanelProps>(), {
  readonly: false,
});

// Refs
const dropZoneRef = useTemplateRef('dropZoneRef');
const uploadInputRef = useTemplateRef('uploadInputRef');
const replaceInputRef = useTemplateRef('replaceInputRef');
const replaceTargetId = ref<string | null>(null);
const renameTarget = ref<AgentContextDocument | null>(null);
const isRenameOpen = ref(false);

// Composables
const { t, n, d } = useI18n();
const { data, isPending: isLoading } = useGetAgentContextDocuments(
  () => props.agentId,
);
const { isPending: isUploading, mutate: uploadDocuments } =
  useUploadAgentContextDocuments();
const { mutate: replaceDocumentFile } = useReplaceAgentContextDocumentFile();
const { mutate: retryDocument } = useRetryAgentContextDocument();
const { mutate: deleteDocument } = useDeleteAgentContextDocument();
const { isOverDropZone } = useDropZone(dropZoneRef, {
  multiple: true,
  onDrop: (files) => uploadFiles(files),
});

// Computed
const maxFileSizeLabel = formatFileSize(AGENT_CONTEXT_DOCUMENT_MAX_FILE_BYTES);
const documents = computed<AgentContextDocument[]>(
  () => data.value?.documents ?? [],
);
const maxFiles = AGENT_CONTEXT_DOCUMENT_MAX_FILES;

// Functions
function formatFileSize(bytes: number): string {
  const fractionOptions = { maximumFractionDigits: 1 };
  if (bytes < 1024) return `${n(bytes)} B`;
  if (bytes < 1024 ** 2) return `${n(bytes / 1024, fractionOptions)} KB`;
  return `${n(bytes / 1024 ** 2, fractionOptions)} MB`;
}

function formatUploadedAt(document: AgentContextDocument): string {
  return d(new Date(document.createdAt), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function uploadedAtLabel(document: AgentContextDocument): string {
  const uploadedAt = t('agent.context.uploadedAt', {
    date: formatUploadedAt(document),
  });
  return document.isTruncated
    ? `${uploadedAt} · ${t('agent.context.truncated')}`
    : uploadedAt;
}

// Client-side mirror of the API's validation, so an obviously invalid batch
// (too many files, an oversized file) never has to make a round trip. The
// API re-checks everything regardless.
function uploadFiles(files: File[] | null) {
  if (!files || files.length === 0) return;

  const oversizedFile = files.find(
    (file) => file.size > AGENT_CONTEXT_DOCUMENT_MAX_FILE_BYTES,
  );
  if (oversizedFile) {
    toast.error(
      t('agent.context.errors.fileTooLarge', {
        name: oversizedFile.name,
        size: maxFileSizeLabel,
      }),
    );
    return;
  }

  if (
    documents.value.length + files.length >
    AGENT_CONTEXT_DOCUMENT_MAX_FILES
  ) {
    toast.error(
      t('agent.context.errors.tooManyFiles', {
        max: AGENT_CONTEXT_DOCUMENT_MAX_FILES,
      }),
    );
    return;
  }

  uploadDocuments({ agentId: props.agentId, files });
}

function openUploadPicker() {
  uploadInputRef.value?.click();
}

function handleUploadInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  uploadFiles(input.files ? Array.from(input.files) : null);
  input.value = '';
}

function startRename(document: AgentContextDocument) {
  renameTarget.value = document;
  isRenameOpen.value = true;
}

function openReplacePicker(document: AgentContextDocument) {
  replaceTargetId.value = document.id;
  replaceInputRef.value?.click();
}

function handleReplaceInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const documentId = replaceTargetId.value;
  input.value = '';
  replaceTargetId.value = null;

  if (!file || !documentId) return;

  replaceDocumentFile({ agentId: props.agentId, documentId, file });
}

function handleRetry(document: AgentContextDocument) {
  retryDocument({ agentId: props.agentId, documentId: document.id });
}

function handleDelete(document: AgentContextDocument) {
  deleteDocument({ agentId: props.agentId, documentId: document.id });
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="!props.readonly"
      ref="dropZoneRef"
      role="button"
      tabindex="0"
      class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-surface-subtle p-8 text-center transition-colors"
      :class="
        isOverDropZone
          ? 'border-primary bg-primary/5'
          : 'border-border-strong hover:border-muted-foreground/50'
      "
      @click="openUploadPicker"
      @keydown.enter="openUploadPicker"
      @keydown.space.prevent="openUploadPicker"
    >
      <Icon name="hugeicons:upload-04" class="size-6 text-icon" />
      <p class="text-sm">
        {{ t('agent.context.dropzone.prompt') }}
      </p>
      <p class="text-xs text-muted-foreground">
        {{ t('agent.context.dropzone.formats', { size: maxFileSizeLabel }) }}
      </p>
    </div>
    <p
      v-if="isUploading && !props.readonly"
      class="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner class="size-4" />
      {{ t('agent.context.uploading') }}
    </p>

    <div>
      <div v-if="isLoading" class="flex items-center justify-center py-8">
        <Spinner />
      </div>
      <ListTable v-else-if="documents.length > 0">
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="text-sm text-muted-foreground">
              {{ t('common.name') }}
            </TableHead>
            <TableHead class="w-36 text-sm text-muted-foreground">
              {{ t('common.status') }}
            </TableHead>
            <TableHead class="w-24 text-right text-sm text-muted-foreground">
              {{ t('agent.context.tableSize') }}
            </TableHead>
            <TableHead class="w-10">
              <span class="sr-only">{{ t('common.actions') }}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="document in documents" :key="document.id">
            <TableCell>
              <ListTitleCell
                :title="document.name"
                :description="uploadedAtLabel(document)"
              >
                <template #lead>
                  <Icon name="hugeicons:file-02" class="size-4 text-icon" />
                </template>
              </ListTitleCell>
            </TableCell>
            <TableCell class="whitespace-nowrap">
              <TooltipProvider
                v-if="document.status === 'failed' && document.errorMessage"
              >
                <Tooltip>
                  <TooltipTrigger as-child>
                    <span tabindex="0">
                      <Status
                        :tone="STATUS_TONE[document.status]"
                        :label="t(`agent.context.status.${document.status}`)"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{{ document.errorMessage }}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Status
                v-else
                :tone="STATUS_TONE[document.status]"
                :label="t(`agent.context.status.${document.status}`)"
              />
            </TableCell>
            <TableCell
              class="text-right font-mono text-sm whitespace-nowrap text-muted-foreground"
            >
              {{ formatFileSize(document.fileSize) }}
            </TableCell>
            <TableCell>
              <ListRowActions>
                <DropdownMenuItem
                  v-if="!props.readonly"
                  @click="startRename(document)"
                >
                  <Icon name="hugeicons:pencil-edit-02" />
                  {{ t('agent.context.actions.rename') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="!props.readonly"
                  @click="openReplacePicker(document)"
                >
                  <Icon name="hugeicons:file-sync" />
                  {{ t('agent.context.actions.replace') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  v-if="document.status === 'failed' && !props.readonly"
                  @click="handleRetry(document)"
                >
                  <Icon name="hugeicons:reload" />
                  {{ t('agent.context.actions.retry') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator
                  v-if="!props.readonly"
                /> <DropdownMenuItem
                  v-if="!props.readonly"
                  variant="destructive"
                  @click="handleDelete(document)"
                >
                  <Icon name="hugeicons:delete-02" />
                  {{ t('agent.context.actions.delete') }}
                </DropdownMenuItem>
              </ListRowActions>
            </TableCell>
          </TableRow>
        </TableBody>
      </ListTable>
      <p class="pt-2 text-small text-muted-foreground">
        {{ t('agent.context.hint', { max: maxFiles }) }}
      </p>
    </div>
    <AgentContextDocumentRenameDialog
      v-model:open="isRenameOpen"
      :agent-id="agentId"
      :document="renameTarget"
    />
    <!-- Hidden inputs stay outside the dropzone/rows they belong to, so a
         file input is never nested inside another interactive element. -->
    <input
      ref="uploadInputRef"
      type="file"
      multiple
      class="hidden"
      :accept="AGENT_CONTEXT_DOCUMENT_ACCEPT"
      @change="handleUploadInputChange"
    />
    <input
      ref="replaceInputRef"
      type="file"
      class="hidden"
      :accept="AGENT_CONTEXT_DOCUMENT_ACCEPT"
      @change="handleReplaceInputChange"
    />
  </div>
</template>
