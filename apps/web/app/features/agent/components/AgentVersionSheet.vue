<script setup lang="ts">
import { useGetAgentVersions } from '~/features/agent/composables/useAgentLockApi';
import type { AgentLockUser, AgentVersion } from '~/features/agent/types';

interface Props {
  agentId: string;
}

interface VersionEvent {
  key: 'locked' | 'approved' | 'revoked' | 'unlocked';
  user: AgentLockUser | null;
  at: string;
}

// Props
const props = defineProps<Props>();

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { data, isPending, isError } = useGetAgentVersions(
  () => props.agentId,
  () => open.value,
);
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Computed
const versions = computed(() => data.value?.versions ?? []);

// Functions
function eventsOf(version: AgentVersion): VersionEvent[] {
  const events: (VersionEvent | null)[] = [
    { key: 'locked', user: version.lockedBy, at: version.lockedAt },
    version.approvedAt
      ? { key: 'approved', user: version.approvedBy, at: version.approvedAt }
      : null,
    version.revokedAt
      ? { key: 'revoked', user: version.revokedBy, at: version.revokedAt }
      : null,
    version.unlockedAt
      ? { key: 'unlocked', user: version.unlockedBy, at: version.unlockedAt }
      : null,
  ];
  return events.filter((event) => event !== null);
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent>
      <SheetHeader>
        <SheetTitle>{{ t('agent.lock.versions.title') }}</SheetTitle>
        <SheetDescription>
          {{ t('agent.lock.versions.description') }}
        </SheetDescription>
      </SheetHeader>
      <div class="min-h-0 flex-1 overflow-y-auto px-4">
        <div v-if="isPending" class="flex justify-center py-8">
          <Spinner />
        </div>
        <p v-else-if="isError" class="text-sm text-muted-foreground">
          {{ t('agent.lock.versions.loadFailed') }}
        </p>
        <p
          v-else-if="versions.length === 0"
          class="text-sm text-muted-foreground"
          data-testid="agent-versions-empty"
        >
          {{ t('agent.lock.versions.empty') }}
        </p>
        <ol v-else class="space-y-6">
          <li v-for="version in versions" :key="version.id" class="space-y-2">
            <p class="font-medium">
              {{
                t('agent.lock.versions.version', {
                  number: version.versionNumber,
                })
              }}
            </p>
            <ul class="space-y-1 text-sm text-muted-foreground">
              <li v-for="event in eventsOf(version)" :key="event.key">
                {{
                  t(`agent.lock.versions.event.${event.key}`, {
                    user: event.user?.name ?? t('agent.lock.unknownUser'),
                    date: formatDateTime(event.at),
                  })
                }}
              </li>
            </ul>
          </li>
        </ol>
      </div>
    </SheetContent>
  </Sheet>
</template>
