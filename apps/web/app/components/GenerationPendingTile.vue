<script setup lang="ts">
interface Props {
  prompt: string;
}

// Props
defineProps<Props>();
</script>

<template>
  <div
    role="status"
    class="relative isolate flex flex-col justify-between gap-2 overflow-hidden rounded-lg bg-wash-sand p-3"
  >
    <div aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10">
      <div
        class="absolute -top-1/4 -left-1/4 size-full animate-wash-drift rounded-full bg-wash-sea blur-2xl motion-reduce:animate-none"
      />
      <div
        class="absolute -right-1/4 -bottom-1/4 size-3/4 animate-wash-drift rounded-full bg-wash-sage blur-2xl [animation-delay:-2s] [animation-duration:8s] motion-reduce:animate-none"
      />
      <div
        class="absolute top-1/3 left-1/3 size-1/2 animate-wash-drift rounded-full bg-wash-ochre blur-2xl [animation-delay:-4s] [animation-duration:10s] motion-reduce:animate-none"
      />
    </div>

    <p class="line-clamp-4 text-sm text-foreground">{{ prompt }}</p>
    <div class="flex items-center gap-1.5 text-xs font-medium text-foreground">
      <Spinner class="size-3.5" />
      <span>{{ $t('common.generating') }}</span>
    </div>
  </div>
</template>
