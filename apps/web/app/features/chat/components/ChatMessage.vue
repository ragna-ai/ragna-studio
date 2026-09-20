<script setup lang="ts">
import { CopyIcon, EllipsisVerticalIcon, GitBranchIcon } from '@lucide/vue';
import type { ReasoningUIPart, ToolUIPart, UIMessage } from 'ai';
import {
  isFileUIPart,
  isReasoningUIPart,
  isStaticToolUIPart,
  isTextUIPart,
} from 'ai';
import { toast } from 'vue-sonner';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '~/components/ai-elements/message';
import ToolGroup from '~/features/chat/components/ToolGroup.vue';
import { useBranchChatAndNavigate } from '~/features/chat/composables/useChatApi';
import { getFileTypeIconName, isImageMediaType } from '~/features/chat/lib/attachment-mime';

interface Props {
  message: UIMessage;
  chatId: string;
}

const props = defineProps<Props>();

// Composables
const { t } = useI18n();
const apiBaseUrl = useRuntimeConfig().public.apiBaseUrl;
const { branchChatAndNavigate } = useBranchChatAndNavigate();
const { copy } = useClipboard();

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

type RenderItem = UIMessage['parts'][number] | ToolGroupItem;

// Empty, non-streaming reasoning renders nothing, so it shouldn't end a run either.
function isVisibleReasoning(part: UIMessage['parts'][number]): part is ReasoningUIPart {
  return isReasoningUIPart(part) && (part.state === 'streaming' || part.text.trim().length > 0);
}

// Folds tool calls and their narrating reasoning into one group; only text/file parts end a run.
const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = [];
  for (const part of props.message.parts) {
    if (part.type === 'step-start') continue;
    if (isReasoningUIPart(part) && !isVisibleReasoning(part)) continue;

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

// group-[.is-assistant]:w-full
</script>

<template>
  <Message :from="message.role" class="max-w-full">
    <MessageContent>
      <template v-for="(item, index) in renderItems" :key="index">
        <ToolGroup v-if="item.type === 'toolGroup'" :members="item.members" />

        <MessageResponse
          v-else-if="item.type === 'text'"
          :content="item.text"
        />

        <!-- User-attached files (docs/media-library/prd.md, decision 5).
             Assistant-side file rendering is out of scope for v1. -->
        <template v-else-if="isFileUIPart(item) && message.role === 'user'">
          <img
            v-if="isImageMediaType(item.mediaType)"
            :src="item.url"
            :alt="item.filename || 'attachment'"
            class="max-h-64 w-auto rounded-lg"
          />
          <a
            v-else
            :href="resolveAttachmentHref(item.url)"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-accent"
          >
            <Icon
              :name="getFileTypeIconName(item.filename || item.url)"
              class="size-4 shrink-0"
            />
            <span class="truncate">{{ item.filename || item.url }}</span>
          </a>
        </template>
      </template>
    </MessageContent>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-6 shrink-0 self-end opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
          :aria-label="t('chat.message.actions')"
        >
          <EllipsisVerticalIcon class="size-3.5 stroke-1.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem @click="copyText">
          <CopyIcon class="size-3.5 stroke-1.5" />
          {{ t('chat.message.copy') }}
        </DropdownMenuItem>
        <DropdownMenuItem @click="branchFromHere">
          <GitBranchIcon class="size-3.5 stroke-1.5" />
          {{ t('chat.message.branch') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </Message>
</template>
