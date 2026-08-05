<script setup lang="ts">
// Imports
import {
  FileUpIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UploadIcon,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
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
import type { AgentContextDocument } from '~/features/agent/types';
import AgentContextDocumentStatusBadge from './AgentContextDocumentStatusBadge.vue';

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
const documents = computed<AgentContextDocument[]>(
  () => data.value?.documents ?? [],
);
const summaryText = computed<string | null>(() => {
  const summary = data.value?.summary;
  if (!summary) return null;

  const totalChars = `${summary.totalReadyChars.toLocaleString()} chars`;
  // if (summary.mode === 'retrieval') {
  //   const threshold = summary.injectionThreshold.toLocaleString();
  //   return `${totalChars} · indexed`;
  // }
  return `${totalChars}`;
});

// Functions
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
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
    toast.error(`"${oversizedFile.name}" is larger than 10 MB`);
    return;
  }

  if (
    documents.value.length + files.length >
    AGENT_CONTEXT_DOCUMENT_MAX_FILES
  ) {
    toast.error(
      `An agent can have at most ${AGENT_CONTEXT_DOCUMENT_MAX_FILES} documents`,
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
    <p
      v-if="!isLoading && documents.length > 0 && summaryText"
      class="text-sm text-muted-foreground"
    >
      {{ summaryText }}
    </p>
    <div v-if="isLoading" class="flex items-center justify-center py-8">
      <Spinner />
    </div>
    <div
      v-else-if="documents.length === 0"
      class="text-sm text-muted-foreground"
    >
      No documents uploaded yet.
    </div>
    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Status</TableHead>
          <TableHead class="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="document in documents" :key="document.id">
          <TableCell class="max-w-xs">
            <Input
              v-if="renamingDocumentId === document.id"
              v-model="renameValue"
              autofocus
              class="h-8"
              autocomplete="off"
              @keydown.enter="commitRename(document)"
              @keydown.escape="cancelRename"
              @blur="commitRename(document)"
            />
            <template v-else>
              <button
                type="button"
                class="block truncate text-left text-sm hover:underline"
                @click="startRename(document)"
              >
                {{ document.name }}
              </button>
              <p
                v-if="document.isTruncated"
                class="text-xs text-muted-foreground"
              >
                Truncated: only the first part of this document was kept.
              </p>
            </template>
          </TableCell>
          <TableCell class="text-sm whitespace-nowrap text-muted-foreground">
            {{ formatFileSize(document.fileSize) }}
          </TableCell>
          <TableCell>
            <TooltipProvider
              v-if="document.status === 'failed' && document.errorMessage"
            >
              <Tooltip>
                <TooltipTrigger as-child>
                  <span>
                    <AgentContextDocumentStatusBadge
                      :status="document.status"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ document.errorMessage }}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <AgentContextDocumentStatusBadge v-else :status="document.status" />
          </TableCell>
          <TableCell class="text-right whitespace-nowrap">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Rename document"
              @click.stop="startRename(document)"
            >
              <PencilIcon class="size-4 stroke-1.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Replace file"
              @click.stop="openReplacePicker(document)"
            >
              <FileUpIcon class="size-4 stroke-1.5" />
            </Button>
            <Button
              v-if="document.status === 'failed'"
              type="button"
              variant="outline"
              size="icon"
              aria-label="Retry extraction"
              @click.stop="handleRetry(document)"
            >
              <RotateCcwIcon class="size-4 stroke-1.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Delete document"
              @click.stop="handleDelete(document)"
            >
              <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <p
      v-if="isUploading"
      class="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner class="size-4" />
      Uploading...
    </p>

    <div
      ref="dropZoneRef"
      role="button"
      tabindex="0"
      class="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors"
      :class="
        isOverDropZone
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50'
      "
      @click="openUploadPicker"
      @keydown.enter="openUploadPicker"
      @keydown.space.prevent="openUploadPicker"
    >
      <UploadIcon class="size-6 text-muted-foreground" />
      <p class="text-sm text-muted-foreground">
        Drag and drop files here, or click to browse.
      </p>
      <p class="text-xs text-muted-foreground">
        PDF, DOCX, PPTX, XLSX, CSV, TXT or MD, up to 10 MB each.
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
