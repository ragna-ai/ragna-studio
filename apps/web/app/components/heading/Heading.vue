<script setup lang="ts">
type BgPosition = 'top' | 'center' | 'bottom';

const props = defineProps<{
  imgUrl?: string;
  bgPosition?: BgPosition;
}>();

const img = useImage();

const gradientBackground = [
  'linear-gradient(to bottom, transparent 40%, #ffffff 100%)',
  'linear-gradient(105deg, #dcf3f1 0%, #e1ecf7 50%, #e4e6f6 100%)',
].join(', ');

const backgroundStyles = computed(() => {
  if (props.imgUrl) {
    const imgUrl = img(props.imgUrl, { width: 2000, format: 'webp' });
    return { backgroundImage: `url('${imgUrl}')` };
  }
  return { backgroundImage: gradientBackground };
});

const bgPositionClass = computed(() => {
  switch (props.bgPosition) {
    case 'top':
      return 'bg-top';
    case 'center':
      return 'bg-center';
    case 'bottom':
      return 'bg-bottom';
    default:
      return 'bg-top';
  }
});
</script>

<template>
  <div class="overflow-hidden rounded-b-xl">
    <div
      class="flex min-h-5 overflow-hidden rounded-lg bg-[#E9F0FB] bg-cover bg-no-repeat p-8 text-foreground"
      :style="backgroundStyles"
    >
      <slot name="top" />
    </div>
    <div class="flex overflow-hidden rounded-lg pt-3 pr-1">
      <slot name="bottom" />
    </div>
  </div>
</template>
