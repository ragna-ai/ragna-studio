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

type AgentToolGroup = {
  key: 'builtin' | 'connected';
  entries: AgentToolCatalogEntry[];
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
const toolGroups = computed<AgentToolGroup[]>(() =>
  [
    {
      key: 'builtin' as const,
      entries: AGENT_TOOL_CATALOG.filter(
        ({ category }) => category === 'builtin',
      ),
    },
    {
      key: 'connected' as const,
      entries: AGENT_TOOL_CATALOG.filter(
        ({ category }) => category !== 'builtin',
      ),
    },
  ].filter((group) => group.entries.length > 0),
);

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
  <div class="space-y-6">
    <section
      v-for="group in toolGroups"
      :key="group.key"
      :aria-label="$t(`agent.tool.groups.${group.key}`)"
    >
      <p
        class="mb-2 font-mono text-caption font-medium tracking-[0.04em] text-muted-foreground uppercase"
      >
        {{ $t(`agent.tool.groups.${group.key}`) }}
      </p>
      <div
        v-for="entry in group.entries"
        :key="entry.id"
        :data-invalid="props.invalid"
        class="grid grid-cols-[1rem_1rem_1fr] gap-x-3 py-2"
      >
        <Checkbox
          :id="`form-rhf-checkbox-${entry.id}`"
          :name="entry.id"
          :model-value="isGranted(entry.id)"
          class="mt-0.5"
          @update:model-value="
            (checked) => handleToggle(entry, Boolean(checked))
          "
        />
        <Label
          :for="`form-rhf-checkbox-${entry.id}`"
          class="col-span-2 col-start-2 grid cursor-pointer grid-cols-subgrid items-start"
        >
          <Icon
            :name="AGENT_TOOL_ICONS[entry.id]"
            class="mt-0.5 size-4 text-icon"
          />
          <div>
            <p class="flex items-center gap-1 text-sm">
              {{ $t(`agent.tool.${entry.id}.label`) }}
              <TooltipProvider v-if="isConnectMissing(entry)">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      class="-my-0.5"
                      :aria-label="$t('agent.tool.notConnected')"
                      @click.prevent="navigateTo(CONNECTIONS_PAGE_PATH)"
                    >
                      <Icon
                        name="hugeicons:alert-02"
                        class="text-status-warn-fg"
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start">
                    <p>{{ $t('agent.tool.notConnected') }}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </p>
            <p class="text-sm font-normal text-muted-foreground">
              {{ $t(`agent.tool.${entry.id}.description`) }}
            </p>
          </div>
        </Label>

        <div
          v-if="entry.hasAccessLevels && isGranted(entry.id)"
          class="col-start-3 mt-2 flex items-center gap-2"
        >
          <Label
            class="w-30 shrink-0 text-sm font-normal text-muted-foreground"
          >
            {{ $t('agent.tool.accessLevelLabel') }}
          </Label>
          <Select
            :model-value="grantedAccess(entry.id)"
            @update:model-value="
              (v) => handleAccessChange(entry, v === 'write' ? 'write' : 'read')
            "
          >
            <SelectTrigger size="sm" class="w-60">
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
        </div>

        <div
          v-if="entry.id === 'datasets' && isDatasetsGranted"
          class="col-start-3 mt-2 flex items-center gap-2"
        >
          <Label
            class="w-30 shrink-0 text-sm font-normal text-muted-foreground"
          >
            {{ $t('agent.tool.datasets.defaultDatasetLabel') }}
          </Label>
          <Select
            :model-value="defaultDatasetId ?? NO_DATASET"
            @update:model-value="
              (v) =>
                emit(
                  'update:defaultDatasetId',
                  v === NO_DATASET ? null : String(v),
                )
            "
          >
            <SelectTrigger size="sm" class="w-60">
              <SelectValue
                :placeholder="
                  $t('agent.tool.datasets.defaultDatasetPlaceholder')
                "
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
      </div>
    </section>
  </div>
</template>
