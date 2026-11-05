<script setup lang="ts">
import { CloudUploadIcon } from '@lucide/vue';
import type { ToolUIPart } from 'ai';
import * as z from 'zod';
import { ToolStatusBadge } from '~/components/ai-elements/tool';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
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

// Functions
function respond(approved: boolean) {
  if (!approvalId.value) return;
  emit('respond', { id: approvalId.value, approved });
}
</script>

<template>
  <Card class="not-prose w-full gap-3 py-4">
    <CardHeader class="flex items-center justify-between gap-2 px-4">
      <CardTitle class="flex items-center gap-2 text-sm">
        <CloudUploadIcon class="size-4 stroke-1.5" />
        {{
          isUpdate
            ? t('chat.toolApproval.updateTitle')
            : t('chat.toolApproval.createTitle')
        }}
      </CardTitle>
      <ToolStatusBadge :state="part.state" />
    </CardHeader>
    <CardContent class="space-y-3 px-4 text-sm">
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
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
          class="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap"
          :class="{ 'font-mono': isCsv }"
          >{{ input?.content }}</pre>
      </div>
      <p v-if="part.state === 'output-denied'" class="text-muted-foreground">
        {{ t('chat.toolApproval.denied') }}
      </p>
      <p v-else-if="failureMessage" class="text-destructive">
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
    </CardContent>
    <CardFooter v-if="isPending" class="gap-2 px-4">
      <Button size="sm" @click="respond(true)">
        {{ t('chat.toolApproval.approve') }}
      </Button>
      <Button size="sm" variant="outline" @click="respond(false)">
        {{ t('chat.toolApproval.deny') }}
      </Button>
    </CardFooter>
  </Card>
</template>
