<script setup lang="ts">
interface ChatMessageActionsProps {
  alwaysVisible?: boolean;
}

defineProps<ChatMessageActionsProps>();

const emit = defineEmits<{
  copy: [];
  branch: [];
}>();

const { t } = useI18n();
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
            size="icon"
            class="size-7 rounded-sm text-icon"
            :aria-label="t('chat.message.copy')"
            @click="emit('copy')"
          >
            <Icon name="hugeicons:copy-01" class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t('chat.message.copy') }}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7 rounded-sm text-icon"
            :aria-label="t('chat.message.branch')"
            @click="emit('branch')"
          >
            <Icon name="hugeicons:git-branch" class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t('chat.message.branch') }}</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</template>
