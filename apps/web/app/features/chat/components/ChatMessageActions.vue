<script setup lang="ts">
interface ChatMessageActionsProps {
  alwaysVisible?: boolean;
  copied?: boolean;
}

const props = defineProps<ChatMessageActionsProps>();

const emit = defineEmits<{
  copy: [];
  branch: [];
}>();

const { t } = useI18n();

const copyLabel = computed(() =>
  props.copied ? t('chat.message.copied') : t('chat.message.copy'),
);
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div
      class="flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 data-[visible=true]:opacity-100"
      :data-visible="alwaysVisible"
    >
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="text-icon"
            :aria-label="copyLabel"
            @click="emit('copy')"
          >
            <Icon
              v-if="copied"
              name="hugeicons:tick-02"
              class="text-status-ok-fg"
            />
            <Icon v-else name="hugeicons:copy-01" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ copyLabel }}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="text-icon"
            :aria-label="t('chat.message.branch')"
            @click="emit('branch')"
          >
            <Icon name="hugeicons:git-branch" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t('chat.message.branch') }}</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</template>
