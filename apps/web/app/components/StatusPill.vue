<script setup lang="ts">
export type StatusPillTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'agent';

interface StatusPillProps {
  tone: StatusPillTone;
  label: string;
}

const props = defineProps<StatusPillProps>();

const TONE_CLASS: Record<StatusPillTone, string> = {
  ok: 'bg-status-ok-bg text-status-ok-fg',
  warn: 'bg-status-warn-bg text-status-warn-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
  agent: 'bg-agent-subtle text-agent-text',
};

const DOT_CLASS: Record<Exclude<StatusPillTone, 'agent'>, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  danger: 'bg-status-danger',
  neutral: 'bg-status-neutral',
};

const dotClass = computed(() =>
  props.tone === 'agent' ? null : DOT_CLASS[props.tone],
);
</script>

<template>
  <span
    class="inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full px-2 text-caption font-medium whitespace-nowrap"
    :class="[TONE_CLASS[tone], tone === 'agent' && 'pl-1.75']"
  >
    <Icon
      v-if="tone === 'agent'"
      name="hugeicons:loading-03"
      class="size-3 text-agent motion-safe:animate-spin"
    />
    <span v-else class="size-1.5 rounded-full" :class="dotClass" />
    {{ label }}
  </span>
</template>
