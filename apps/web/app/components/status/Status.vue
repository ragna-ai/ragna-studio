<script setup lang="ts">
import Spinner from '~/components/ui/spinner/Spinner.vue';

export type StatusTone =
  | 'ok'
  | 'neutral'
  | 'warn'
  | 'danger'
  | 'pending'
  | 'agent';

export type StatusSize = 'default' | 'sm';

interface StatusProps {
  tone: StatusTone;
  label: string;
  size?: StatusSize;
}

withDefaults(defineProps<StatusProps>(), { size: 'default' });

const SIZE_CLASS: Record<StatusSize, string> = {
  default: 'h-5 gap-1.5 text-body',
  sm: 'h-4 gap-1 text-caption',
};

const DOT_CLASS: Record<Exclude<StatusTone, 'pending' | 'agent'>, string> = {
  ok: 'bg-status-ok',
  neutral: 'bg-status-neutral',
  warn: 'bg-status-warn',
  danger: 'bg-status-danger',
};

const TEXT_CLASS: Record<StatusTone, string> = {
  ok: 'text-foreground',
  warn: 'text-foreground',
  danger: 'text-foreground',
  neutral: 'text-muted-foreground',
  pending: 'text-muted-foreground',
  agent: 'text-agent-text',
};
</script>

<template>
  <span
    class="inline-flex items-center"
    :class="[SIZE_CLASS[size], TEXT_CLASS[tone]]"
  >
    <Spinner
      v-if="tone === 'pending'"
      aria-hidden="true"
      class="size-3 text-icon"
    />
    <Spinner
      v-else-if="tone === 'agent'"
      aria-hidden="true"
      class="size-3 text-agent"
    />
    <span v-else class="size-1.5 rounded-full" :class="DOT_CLASS[tone]" />
    {{ label }}
  </span>
</template>
