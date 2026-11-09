<script setup lang="ts">
import type { ToolUIPart } from 'ai';
import * as z from 'zod';
import StatusPill from '~/components/StatusPill.vue';
import { Button } from '~/components/ui/button';
import { TOOL_STATE_TONE } from '~/features/chat/lib/tool-status';
import type { ToolApprovalDecision } from '~/features/chat/types';

// Props
interface Props {
  part: ToolUIPart;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  respond: [decision: ToolApprovalDecision];
}>();

// Composables
const { t } = useI18n();

const writeInputSchema = z.object({
  name: z.string().optional(),
  fileId: z.string().optional(),
  folderId: z.string().optional(),
  format: z.string().optional(),
  content: z.string(),
});

const writeOutputSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
  name: z.string().optional(),
  webUrl: z.string().optional(),
});

// Computed
const input = computed(() => writeInputSchema.safeParse(props.part.input).data);
const output = computed(
  () => writeOutputSchema.safeParse(props.part.output).data,
);
const isUpdate = computed(() => props.part.type.endsWith('UpdateFile'));
const isCsv = computed(() => input.value?.format === 'csv');
const approvalId = computed(() => props.part.approval?.id);
const isPending = computed(
  () => props.part.state === 'approval-requested' && !!approvalId.value,
);
const savedUrl = computed(() => {
  const url = output.value?.webUrl;
  return output.value?.status === 'ok' && url?.startsWith('https://')
    ? url
    : undefined;
});
const failureMessage = computed(() => {
  if (props.part.state === 'output-error') return props.part.errorText;
  if (output.value && output.value.status !== 'ok') return output.value.message;
  return undefined;
});

const pill = computed(() => {
  if (failureMessage.value) {
    return { tone: TOOL_STATE_TONE['output-error'], key: 'output-error' };
  }
  return { tone: TOOL_STATE_TONE[props.part.state], key: props.part.state };
});
const pillLabel = computed(() =>
  pill.value.key === 'output-available'
    ? t('chat.toolApproval.saved')
    : t(`chat.toolStatus.${pill.value.key}`),
);

// Functions
function respond(approved: boolean) {
  if (!approvalId.value) return;
  emit('respond', { id: approvalId.value, approved });
}
</script>

<template>
  <div
    class="not-prose w-full overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs"
  >
    <div
      class="flex h-11 items-center gap-2 border-b bg-surface-subtle pr-3 pl-3.5"
    >
      <Icon name="hugeicons:cloud-upload" class="size-4 shrink-0 text-icon" />
      <h3 class="min-w-0 flex-1 truncate text-body font-medium">
        {{
          isUpdate
            ? t('chat.toolApproval.updateTitle')
            : t('chat.toolApproval.createTitle')
        }}
      </h3>
      <StatusPill :tone="pill.tone" :label="pillLabel" />
    </div>
    <div class="flex flex-col gap-2.5 px-4 py-3.5 text-small">
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <template v-if="isUpdate">
          <dt class="text-muted-foreground">
            {{ t('chat.toolApproval.fileId') }}
          </dt>
          <dd class="break-all">{{ input?.fileId }}</dd>
        </template>
        <template v-else>
          <dt class="text-muted-foreground">
            {{ t('chat.toolApproval.fileName') }}
          </dt>
          <dd class="break-all">{{ input?.name }}</dd>
          <dt class="text-muted-foreground">
            {{ t('chat.toolApproval.folder') }}
          </dt>
          <dd class="break-all">
            {{ input?.folderId ?? t('chat.toolApproval.rootFolder') }}
          </dd>
        </template>
      </dl>
      <div>
        <p class="mb-1 text-muted-foreground">
          {{
            isUpdate
              ? t('chat.toolApproval.newContent')
              : t('chat.toolApproval.content')
          }}
        </p>
        <pre
          class="max-h-64 overflow-auto text-body whitespace-pre-wrap"
          :class="{ 'font-mono': isCsv }"
          >{{ input?.content }}</pre>
      </div>
      <p v-if="part.state === 'output-denied'" class="text-muted-foreground">
        {{ t('chat.toolApproval.denied') }}
      </p>
      <p v-else-if="failureMessage" class="text-status-danger-fg">
        {{ failureMessage }}
      </p>
      <a
        v-else-if="savedUrl"
        :href="savedUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="font-medium underline underline-offset-4"
      >
        {{ t('chat.toolApproval.openFile', { name: output?.name }) }}
      </a>
    </div>
    <div
      v-if="isPending"
      class="flex h-13 items-center gap-2 border-t pr-3 pl-4"
    >
      <p class="min-w-0 flex-1 text-small text-muted-foreground">
        {{ t('chat.toolApproval.hint') }}
      </p>
      <Button variant="outline" @click="respond(false)">
        {{ t('chat.toolApproval.deny') }}
      </Button>
      <Button @click="respond(true)">
        {{ t('chat.toolApproval.approve') }}
      </Button>
    </div>
  </div>
</template>
