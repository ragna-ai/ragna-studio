<script setup lang="ts">
import type { ReasoningUIPart, ToolUIPart, UIMessage } from 'ai';
import {
  isFileUIPart,
  isReasoningUIPart,
  isStaticToolUIPart,
  isTextUIPart,
} from 'ai';
import { toast } from 'vue-sonner';
import { Message, MessageResponse } from '~/components/ai-elements/message';
import AgentMark from '~/features/agent/components/AgentMark.vue';
import ChatMessageActions from '~/features/chat/components/ChatMessageActions.vue';
import ToolApprovalCard from '~/features/chat/components/ToolApprovalCard.vue';
import ToolGroup from '~/features/chat/components/ToolGroup.vue';
import { useBranchChatAndNavigate } from '~/features/chat/composables/useChatApi';
import {
  getFileTypeIconName,
  isImageMediaType,
} from '~/features/chat/lib/attachment-mime';
import type { ToolApprovalDecision } from '~/features/chat/types';

interface Props {
  message: UIMessage;
  chatId: string;
  agentId?: string;
  agentName?: string;
  isLast?: boolean;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  approvalResponse: [decision: ToolApprovalDecision];
}>();

// Composables
const { t } = useI18n();
const apiBaseUrl = useRuntimeConfig().public.apiBaseUrl;
const { branchChatAndNavigate } = useBranchChatAndNavigate();
const { copy } = useClipboard();

const isUser = computed(() => props.message.role === 'user');

const MARKDOWN_CLASS = [
  'text-chat',
  // the renderer sets an inline line-height of 1.75 on plain paragraphs
  '[&_p]:leading-6!',
  '[&_a]:text-foreground [&_a]:underline-offset-4',
  '[&_table_tbody]:bg-transparent [&_table_tbody]:font-normal',
  '[&_table_th]:h-9 [&_table_th]:px-3.5 [&_table_th]:py-0 [&_table_th]:text-caption [&_table_th]:font-medium [&_table_th]:text-muted-foreground',
  '[&_table_td]:h-10 [&_table_td]:px-3.5 [&_table_td]:py-0 [&_table_td]:text-body',
  '[&_table_thead]:bg-surface-subtle [&_table]:rounded-[10px]',
  '[&_table_tbody_tr:last-child]:border-b-0',
  "[&_table_:is(th,td)[style*='right']]:font-mono [&_table_:is(th,td)[style*='right']]:text-mono [&_table_:is(th,td)[style*='right']]:tabular-nums",
];

// Functions
function branchFromHere() {
  branchChatAndNavigate({ chatId: props.chatId, messageId: props.message.id });
}

function copyText() {
  const text = props.message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join('\n\n');
  copy(text);
  toast.success(t('chat.message.copied'));
}

// Document file parts carry a relative, env-independent API download path
// (`/workspace/:id/media/:id/download`, apps/api media.service.ts), never
// stored or sent as absolute (the server-side model resolution regex
// depends on that shape). Resolve it against the API origin only for
// display here; image parts already carry an absolute CDN url and pass
// through unchanged.
function resolveAttachmentHref(url: string): string {
  return url.startsWith('/') ? `${apiBaseUrl}${url}` : url;
}

type GroupMember = ToolUIPart | ReasoningUIPart;

// Sentinel type slotted into the same v-if/v-else-if chain as real parts;
// deliberately not `tool-group` since that literal also matches ToolUIPart's
// `` `tool-${string}` `` type and would defeat discrimination.
interface ToolGroupItem {
  type: 'toolGroup';
  members: GroupMember[];
}

// A tool call that asks the user first stays visible; a collapsed group would hide it.
interface ToolApprovalItem {
  type: 'toolApproval';
  part: ToolUIPart;
}

type RenderItem = UIMessage['parts'][number] | ToolGroupItem | ToolApprovalItem;

// Empty, non-streaming reasoning renders nothing, so it shouldn't end a run either.
function isVisibleReasoning(
  part: UIMessage['parts'][number],
): part is ReasoningUIPart {
  return (
    isReasoningUIPart(part) &&
    (part.state === 'streaming' || part.text.trim().length > 0)
  );
}

// Folds tool calls and their narrating reasoning into one group; only text/file parts end a run.
const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = [];
  for (const part of props.message.parts) {
    if (part.type === 'step-start') continue;
    if (isReasoningUIPart(part) && !isVisibleReasoning(part)) continue;

    if (isStaticToolUIPart(part) && part.approval !== undefined) {
      items.push({ type: 'toolApproval', part });
      continue;
    }

    if (isStaticToolUIPart(part) || isVisibleReasoning(part)) {
      const last = items.at(-1);
      if (last?.type === 'toolGroup') {
        last.members.push(part);
        continue;
      }
      items.push({ type: 'toolGroup', members: [part] });
      continue;
    }

    items.push(part);
  }
  return items;
});
</script>

<template>
  <Message
    :from="message.role"
    :class="isUser ? 'max-w-full' : 'max-w-full flex-col gap-4'"
  >
    <div v-if="!isUser" class="flex h-6 items-center gap-2">
      <AgentMark v-if="agentId" :agent-id="agentId" :size="24" />
      <span v-if="agentName" class="text-body font-medium">
        {{ agentName }}
      </span>
    </div>

    <div
      class="flex flex-col gap-2"
      :class="
        isUser
          ? 'ml-auto w-fit max-w-4/5 rounded-xl bg-chip px-3.5 py-2.5 text-chat leading-6'
          : 'w-full'
      "
    >
      <template v-for="(item, index) in renderItems" :key="index">
        <ToolGroup v-if="item.type === 'toolGroup'" :members="item.members" />

        <ToolApprovalCard
          v-else-if="item.type === 'toolApproval'"
          :part="item.part"
          @respond="emit('approvalResponse', $event)"
        />

        <MessageResponse
          v-else-if="item.type === 'text'"
          :content="item.text"
          :class="MARKDOWN_CLASS"
        />

        <!-- User-attached files.
             Assistant-side file rendering is out of scope for v1. -->
        <template v-else-if="isFileUIPart(item) && isUser">
          <img
            v-if="isImageMediaType(item.mediaType)"
            :src="item.url"
            :alt="item.filename || 'attachment'"
            class="max-h-64 w-auto max-w-full self-start rounded-lg"
          />
          <a
            v-else
            :href="resolveAttachmentHref(item.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-body hover:bg-accent"
          >
            <Icon
              :name="getFileTypeIconName(item.filename || item.url)"
              class="size-4 shrink-0"
            />
            <span class="truncate">{{ item.filename || item.url }}</span>
          </a>
        </template>
      </template>
    </div>

    <ChatMessageActions
      v-if="!isUser"
      :always-visible="isLast"
      @copy="copyText"
      @branch="branchFromHere"
    />
  </Message>
</template>
