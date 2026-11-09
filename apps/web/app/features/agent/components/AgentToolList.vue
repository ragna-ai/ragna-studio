<script setup lang="ts">
import {
  AGENT_TOOL_CATALOG,
  agentToolGrantSchema,
  type AgentToolCatalogEntry,
  type AgentToolGrant,
  type AgentToolId,
  type ToolAccess,
} from '@repo/ai/client';
import { AGENT_TOOL_ICONS } from '~/features/agent/lib/agent-tool-icons';
import { useGetIntegrationConnections } from '~/features/integrations/composables/useIntegrationApi';
import { CONNECTIONS_PAGE_PATH } from '~/features/integrations/lib/integration-meta';
import { useGetAllDatasetsForPicker } from '~/features/dataset/composables/useDatasetApi';

type AgentToolListProps = {
  modelValue: AgentToolGrant[];
  invalid?: boolean;
  defaultDatasetId?: string | null;
};

type AgentToolListEmit = {
  'update:modelValue': [value: AgentToolGrant[]];
  'update:defaultDatasetId': [value: string | null];
};

// shadcn's Select can't use an empty string as an item value (it's the
// internal "no selection" sentinel), so a "None" option needs its own
// placeholder value, mapped back to `null` on change. Same pattern as
// WorkflowAgentConfigForm's NO_AGENT.
const NO_DATASET = '__none__';

const DEFAULT_ACCESS: ToolAccess = 'read';

// Props
const props = withDefaults(defineProps<AgentToolListProps>(), {
  invalid: false,
  defaultDatasetId: null,
});

// Emits
const emit = defineEmits<AgentToolListEmit>();

// Composables
const { data: datasetsData } = useGetAllDatasetsForPicker();
const { data: connectionsData } = useGetIntegrationConnections();

// Computed
const pickerDatasets = computed(() => datasetsData.value?.datasets ?? []);
const connectedIntegrationIds = computed(
  () =>
    new Set<string>(
      connectionsData.value?.connections.flatMap(
        (connection) => connection.integrations,
      ) ?? [],
    ),
);
const isDatasetsGranted = computed(() => isGranted('datasets'));

// Functions
function isGranted(toolId: AgentToolId): boolean {
  return props.modelValue.some((grant) => grant.id === toolId);
}

function grantedAccess(toolId: AgentToolId): ToolAccess | undefined {
  for (const grant of props.modelValue) {
    if (grant.id === toolId && 'access' in grant) return grant.access;
  }
  return undefined;
}

function toGrant(
  entry: AgentToolCatalogEntry,
  access: ToolAccess,
): AgentToolGrant | undefined {
  const candidate = entry.hasAccessLevels
    ? { id: entry.id, access }
    : { id: entry.id };
  const parsed = agentToolGrantSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

/** Replaces only this entry's grant. Every other grant passes through unchanged. */
function emitGrantFor(
  entry: AgentToolCatalogEntry,
  grant: AgentToolGrant | undefined,
) {
  const others = props.modelValue.filter(({ id }) => id !== entry.id);
  emit('update:modelValue', grant ? [...others, grant] : others);
}

function handleToggle(entry: AgentToolCatalogEntry, checked: boolean) {
  emitGrantFor(entry, checked ? toGrant(entry, DEFAULT_ACCESS) : undefined);
}

function handleAccessChange(entry: AgentToolCatalogEntry, access: ToolAccess) {
  emitGrantFor(entry, toGrant(entry, access));
}

function isConnectMissing(entry: AgentToolCatalogEntry): boolean {
  return (
    entry.category !== 'builtin' &&
    connectionsData.value !== undefined &&
    !connectedIntegrationIds.value.has(entry.id)
  );
}
</script>

<template>
  <template v-for="entry in AGENT_TOOL_CATALOG" :key="entry.id">
    <div
      :data-invalid="props.invalid"
      class="flex flex-row items-center space-x-3"
    >
      <Checkbox
        :id="`form-rhf-checkbox-${entry.id}`"
        :name="entry.id"
        :model-value="isGranted(entry.id)"
        class="border-stone-600"
        @update:model-value="(checked) => handleToggle(entry, Boolean(checked))"
      >
        <Icon name="hugeicons:tick-02" class="size-3.5" />
      </Checkbox>
      <Label
        :for="`form-rhf-checkbox-${entry.id}`"
        class="flex cursor-pointer space-x-3"
      >
        <div class="flex justify-center">
          <Icon :name="AGENT_TOOL_ICONS[entry.id]" class="size-5 text-icon" />
        </div>
        <div class="space-y-1">
          <p class="text-sm">{{ $t(`agent.tool.${entry.id}.label`) }}</p>
          <p class="text-xs font-normal opacity-75">
            {{ $t(`agent.tool.${entry.id}.description`) }}
          </p>
        </div>
      </Label>
    </div>
    <div
      v-if="entry.hasAccessLevels && isGranted(entry.id)"
      class="ml-8 max-w-xs space-y-2 border-l pl-4"
    >
      <Label class="text-xs text-muted-foreground">
        {{ $t('agent.tool.accessLevelLabel') }}
      </Label>
      <Select
        :model-value="grantedAccess(entry.id)"
        @update:model-value="
          (v) => handleAccessChange(entry, v === 'write' ? 'write' : 'read')
        "
      >
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="read">
            {{ $t('agent.tool.accessLevel.read') }}
          </SelectItem>
          <SelectItem value="write">
            {{ $t('agent.tool.accessLevel.write') }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p v-if="isConnectMissing(entry)" class="text-xs text-muted-foreground">
        {{
          $t('agent.tool.connectHint', {
            name: $t(`agent.tool.${entry.id}.label`),
          })
        }}.
        <NuxtLink :to="CONNECTIONS_PAGE_PATH" class="underline">
          {{ $t('agent.tool.connectLink') }}
        </NuxtLink>
      </p>
    </div>
  </template>

  <div v-if="isDatasetsGranted" class="ml-8 max-w-xs space-y-2 border-l pl-4">
    <Label class="text-xs text-muted-foreground">
      {{ $t('agent.tool.datasets.defaultDatasetLabel') }}
    </Label>
    <Select
      :model-value="defaultDatasetId ?? NO_DATASET"
      @update:model-value="
        (v) =>
          emit('update:defaultDatasetId', v === NO_DATASET ? null : String(v))
      "
    >
      <SelectTrigger class="w-full">
        <SelectValue
          :placeholder="$t('agent.tool.datasets.defaultDatasetPlaceholder')"
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="NO_DATASET">
          {{ $t('agent.tool.datasets.defaultDatasetNone') }}
        </SelectItem>
        <SelectItem
          v-for="dataset in pickerDatasets"
          :key="dataset.id"
          :value="dataset.id"
        >
          {{ dataset.name }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
