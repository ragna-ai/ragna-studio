<script setup lang="ts">
import { agentMarkIconSchema } from '@repo/ai/client';
import { Button } from '~/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import AgentMark from '~/features/agent/components/AgentMark.vue';
import AgentMarkIconPicker from '~/features/agent/components/AgentMarkIconPicker.vue';
import AgentMarkImagePicker from '~/features/agent/components/AgentMarkImagePicker.vue';
import {
  fallbackAgentTone,
  isAgentMarkTone,
} from '~/features/agent/lib/agent-tone';
import type {
  AgentMarkValue,
  UploadedAgentImage,
} from '~/features/agent/types';

interface AgentMarkFieldProps {
  agentId?: string;
}

const DEFAULT_ICON = agentMarkIconSchema.enum.robotic;

const props = defineProps<AgentMarkFieldProps>();

// Models
const mark = defineModel<AgentMarkValue>({ required: true });

// Refs
let pendingPreviewUrl: string | null = null;
const isOpen = ref(false);
const uploadedFileName = ref<string | null>(null);

// Computed
const shownIcon = computed(() => mark.value.icon ?? DEFAULT_ICON);

// The tone the mark has today, so a user who only picks an icon keeps their colour.
const shownTone = computed(() =>
  isAgentMarkTone(mark.value.tone)
    ? mark.value.tone
    : fallbackAgentTone(props.agentId),
);

// Functions
function clearImage() {
  mark.value = { ...mark.value, imageMediaId: null, imageUrl: null };
  uploadedFileName.value = null;
}

function pickIcon(icon: AgentMarkValue['icon']) {
  mark.value = { ...mark.value, icon, imageMediaId: null, imageUrl: null };
}

function pickTone(tone: AgentMarkValue['tone']) {
  mark.value = { ...mark.value, tone, imageMediaId: null, imageUrl: null };
}

// The stored original is replaced by the worker, so its URL stops working. The picked file
// previews from memory until Save, then the saved agent's own URL takes over.
function setImage(image: UploadedAgentImage, file: File) {
  revokePendingPreview();
  pendingPreviewUrl = URL.createObjectURL(file);
  mark.value = {
    ...mark.value,
    imageMediaId: image.mediaId,
    imageUrl: pendingPreviewUrl,
  };
  uploadedFileName.value = file.name;
}

function revokePendingPreview() {
  if (!pendingPreviewUrl) return;
  URL.revokeObjectURL(pendingPreviewUrl);
  pendingPreviewUrl = null;
}

// Hooks
watch(
  () => mark.value.imageUrl,
  (imageUrl) => {
    if (imageUrl !== pendingPreviewUrl) revokePendingPreview();
  },
);
onScopeDispose(revokePendingPreview);
</script>

<template>
  <div class="flex items-center gap-3">
    <AgentMark
      :agent-id="agentId"
      :icon="mark.icon"
      :tone="mark.tone"
      :image-url="mark.imageUrl"
      :size="40"
    />
    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <Button type="button" variant="outline" size="sm">
          {{ $t('agent.mark.change') }}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        :side-offset="8"
        :aria-label="$t('agent.mark.popoverLabel')"
      >
        <Tabs default-value="icon">
          <TabsList class="w-full">
            <TabsTrigger value="icon">{{
              $t('agent.mark.tabs.icon')
            }}</TabsTrigger>
            <TabsTrigger value="image">{{
              $t('agent.mark.tabs.image')
            }}</TabsTrigger>
          </TabsList>
          <TabsContent value="icon" class="pt-4">
            <AgentMarkIconPicker
              :icon="shownIcon"
              :tone="shownTone"
              @update:icon="pickIcon"
              @update:tone="pickTone"
            />
          </TabsContent>
          <TabsContent value="image" class="pt-4">
            <AgentMarkImagePicker
              :agent-id="agentId"
              :image-url="mark.imageUrl"
              :image-name="uploadedFileName"
              @uploaded="setImage"
              @remove="clearImage"
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  </div>
</template>
