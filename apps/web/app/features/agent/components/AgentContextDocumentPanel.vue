<script setup lang="ts">
// Imports
import { toast } from '~/lib/toast';
import {
  AGENT_CONTEXT_DOCUMENT_ACCEPT,
  AGENT_CONTEXT_DOCUMENT_MAX_FILE_BYTES,
  AGENT_CONTEXT_DOCUMENT_MAX_FILES,
  useDeleteAgentContextDocument,
  useGetAgentContextDocuments,
  useRenameAgentContextDocument,
  useReplaceAgentContextDocumentFile,
  useRetryAgentContextDocument,
  useUploadAgentContextDocuments,
} from '~/features/agent/composables/useAgentApi';
import type {
  AgentContextDocument,
  AgentContextDocumentStatus,
} from '~/features/agent/types';
import Status, { type StatusTone } from '~/components/Status.vue';

const STATUS_TONE: Record<AgentContextDocumentStatus, StatusTone> = {
  ready: 'ok',
  pending: 'pending',
  failed: 'danger',
};

type AgentContextDocumentPanelProps = {
  agentId: string;
};

// Props
const props = defineProps<AgentContextDocumentPanelProps>();

// Refs
const dropZoneRef = useTemplateRef('dropZoneRef');
const uploadInputRef = useTemplateRef('uploadInputRef');
const replaceInputRef = useTemplateRef('replaceInputRef');
const replaceTargetId = ref<string | null>(null);
const renamingDocumentId = ref<string | null>(null);
const renameValue = ref('');

// Composables
const { t, n, d } = useI18n();
const { data, isPending: isLoading } = useGetAgentContextDocuments(
  () => props.agentId,
);
const { isPending: isUploading, mutate: uploadDocuments } =
  useUploadAgentContextDocuments();
const { mutate: renameDocument } = useRenameAgentContextDocument();
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
  return d(new Date(document.updatedAt), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
  renamingDocumentId.value = document.id;
  renameValue.value = document.name;
}

function cancelRename() {
  renamingDocumentId.value = null;
}

function commitRename(document: AgentContextDocument) {
  const name = renameValue.value.trim();
  renamingDocumentId.value = null;

  if (name.length === 0 || name === document.name) return;

  renameDocument({ agentId: props.agentId, documentId: document.id, name });
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
        {{ $t('agent.context.dropzone.prompt') }}
      </p>
      <p class="text-xs text-muted-foreground">
        {{ $t('agent.context.dropzone.formats', { size: maxFileSizeLabel }) }}
      </p>
    </div>
    <p
      v-if="isUploading"
      class="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner class="size-4" />
      {{ $t('agent.context.uploading') }}
    </p>

    <div>
      <div v-if="isLoading" class="flex items-center justify-center py-8">
        <Spinner />
      </div>
      <Table v-else-if="documents.length > 0">
        <TableHeader>
          <TableRow>
            <TableHead class="text-sm text-muted-foreground">
              {{ $t('common.name') }}
            </TableHead>
            <TableHead class="text-sm text-muted-foreground">
              {{ $t('common.status') }}
            </TableHead>
            <TableHead class="text-right text-sm text-muted-foreground">
              {{ $t('agent.context.tableSize') }}
            </TableHead>
            <TableHead class="w-10">
              <span class="sr-only">{{ $t('common.actions') }}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="document in documents" :key="document.id">
            <TableCell class="max-w-xs">
              <div class="flex items-center gap-3">
                <Icon
                  name="hugeicons:file-02"
                  class="size-4 shrink-0 text-icon"
                />
                <div class="min-w-0">
                  <Input
                    v-if="renamingDocumentId === document.id"
                    v-model="renameValue"
                    autofocus
                    autocomplete="off"
                    @keydown.enter="commitRename(document)"
                    @keydown.escape="cancelRename"
                    @blur="commitRename(document)"
                  />
                  <p v-else class="truncate text-sm">{{ document.name }}</p>
                  <p class="text-xs text-muted-foreground">
                    {{
                      $t('agent.context.uploadedAt', {
                        date: formatUploadedAt(document),
                      })
                    }}
                  </p>
                  <p
                    v-if="document.isTruncated"
                    class="text-xs text-muted-foreground"
                  >
                    {{ $t('agent.context.truncated') }}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell>
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
            <TableCell class="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="$t('common.actions')"
                  >
                    <Icon name="hugeicons:more-vertical" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  size="sm"
                  align="end"
                  @close-auto-focus.prevent
                >
                  <DropdownMenuItem @select="startRename(document)">
                    {{ $t('agent.context.actions.rename') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @select="openReplacePicker(document)">
                    {{ $t('agent.context.actions.replace') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    v-if="document.status === 'failed'"
                    @select="handleRetry(document)"
                  >
                    {{ $t('agent.context.actions.retry') }}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    @select="handleDelete(document)"
                  >
                    {{ $t('agent.context.actions.delete') }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p class="pt-2 text-small text-muted-foreground">
        {{ $t('agent.context.hint', { max: maxFiles }) }}
      </p>
    </div>
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
