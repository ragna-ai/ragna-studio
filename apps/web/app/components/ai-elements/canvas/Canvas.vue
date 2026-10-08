<script setup lang="ts">
import { Background } from '@vue-flow/background';
import type {
  ConnectionLineProps,
  EdgeProps,
  FlowEmits,
  FlowProps,
  FlowSlots,
  NodeProps,
} from '@vue-flow/core';
import { VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import { useForwardPropsEmits } from 'reka-ui';

const props = withDefaults(defineProps<FlowProps>(), {
  deleteKeyCode: () => ['Backspace', 'Delete'],
  fitViewOnInit: true,
  panOnDrag: false,
  panOnScroll: true,
  selectNodesOnDrag: true,
  zoomOnDoubleClick: false,
});

const emits = defineEmits<FlowEmits>();
const slots = defineSlots<FlowSlots>();

type EmitByName = (name: string, ...args: unknown[]) => void;
// Through unknown on purpose: letting TS relate FlowEmits' dozens of overloads to reka-ui's
// emit parameter took ~265 s of type-check time. Runtime forwarding is unchanged.
const forwarded = useForwardPropsEmits(props, emits as unknown as EmitByName);

// VueFlow's dynamic slots each carry a different, mutually incompatible props
// shape, so the union can't be assigned to any single slot's expected type.
// Casting through the intersection <slot> actually expects keeps this typed
// without resorting to `any`.
type ForwardedSlotProps = NodeProps<any, object, string> &
  EdgeProps<any, object, string> &
  ConnectionLineProps;
function forwardSlotProps(slotProps: unknown) {
  return slotProps as ForwardedSlotProps;
}
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
    <template
      v-for="(_, slotName) in slots"
      :key="slotName"
      #[slotName]="slotProps"
    >
      <slot :name="slotName" v-bind="forwardSlotProps(slotProps) ?? {}" />
    </template>
  </VueFlow>
</template>
