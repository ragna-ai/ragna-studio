<script setup lang="ts">
export interface TocItem {
  id: string
  text: string
  level: number
}

const props = withDefaults(
  defineProps<{
    items: TocItem[]
    title?: string
  }>(),
  { title: 'Table of Contents' },
)

const isOpen = ref(true)
const activeId = ref<string>('')

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  if (!props.items.length) return

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeId.value = entry.target.id
          break
        }
      }
    },
    { rootMargin: '-10% 0px -80% 0px', threshold: 0 },
  )

  for (const item of props.items) {
    const el = document.getElementById(item.id)
    if (el) observer.observe(el)
  }

  onUnmounted(() => observer.disconnect())
})
</script>

<template>
  <div
    class="fixed top-24 right-6 z-40 w-72 rounded-xl border border-border bg-card shadow-md transition-all duration-300"
    :class="isOpen ? 'max-h-[calc(100vh-8rem)]' : 'max-h-14'"
    style="overflow: hidden"
  >
    <!-- Header -->
    <button
      class="flex w-full items-center gap-2.5 px-4 py-3.5 text-left"
      @click="isOpen = !isOpen"
    >
      <Icon name="lucide:list" class="size-4 shrink-0 text-primary" />
      <span class="flex-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {{ title }}
      </span>
      <Icon
        name="lucide:chevron-up"
        class="size-4 shrink-0 text-muted-foreground transition-transform duration-300"
        :class="isOpen ? 'rotate-0' : 'rotate-180'"
      />
    </button>

    <!-- Divider -->
    <div v-if="isOpen" class="h-px bg-border" />

    <!-- Items -->
    <nav
      v-if="isOpen"
      class="overflow-y-auto px-2 py-2"
      style="max-height: calc(100vh - 10rem - 3.5rem)"
    >
      <ul class="space-y-0.5">
        <li v-for="item in items" :key="item.id">
          <button
            class="w-full rounded-md px-3 py-2 text-left text-sm leading-snug transition-colors"
            :class="[
              item.level === 3 ? 'pl-6' : '',
              activeId === item.id
                ? 'border-l-2 border-primary pl-[calc(0.75rem-2px)] font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
              item.level === 3 && activeId === item.id ? 'pl-[calc(1.5rem-2px)]' : '',
            ]"
            @click="scrollTo(item.id)"
          >
            {{ item.text }}
          </button>
        </li>
      </ul>
    </nav>
  </div>
</template>
