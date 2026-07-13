<script setup lang="ts">
import type { FlowEmits, FlowProps, FlowSlots } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { VueFlow } from '@vue-flow/core'
import { useForwardPropsEmits } from 'reka-ui'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const props = withDefaults(defineProps<FlowProps>(), {
  deleteKeyCode: () => ['Backspace', 'Delete'],
  fitViewOnInit: true,
  panOnDrag: false,
  panOnScroll: true,
  selectNodesOnDrag: true,
  zoomOnDoubleClick: false,
})

const emits = defineEmits<FlowEmits>()
const slots = defineSlots<FlowSlots>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <VueFlow data-slot="canvas" v-bind="forwarded">
    <Background />

    <!--
      Forward every slot passed to Canvas (default, connection-line, zoom-pane,
      and the dynamic `node-<type>` / `edge-<type>` slots VueFlow looks up by
      name) straight through to VueFlow. A static list would need editing
      every time a new node/edge type is added.
    -->
    <template v-for="(_, slotName) in slots" :key="slotName" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps ?? {}" />
    </template>
  </VueFlow>
</template>
