<script setup lang="ts">
type BgPosition = 'top' | 'center' | 'bottom';

const props = defineProps<{
  imgUrl?: string;
  bgPosition?: BgPosition;
}>();

const img = useImage();

// Default CSS gradient recreating the teal-to-navy verlauf.
const gradientBackground =
  'linear-gradient(105deg, #29b8b3 0%, #2f7fac 45%, #2f5aa0 70%, #2b3d94 100%)';

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
      class="flex min-h-5 overflow-hidden rounded-lg bg-[#E9F0FB] bg-cover bg-no-repeat p-8 text-white"
      :style="backgroundStyles"
    >
      <slot name="top" />
    </div>
    <div class="flex overflow-hidden rounded-lg pt-3 pr-1">
      <slot name="bottom" />
    </div>
  </div>
</template>
