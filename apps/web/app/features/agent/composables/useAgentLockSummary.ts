import type { MaybeRefOrGetter } from 'vue';
import type { AgentLock } from '~/features/agent/types';

export type AgentLockIconName = `hugeicons:${string}`;

/** The icon of a locked agent: a cloud once approved for unattended runs, else a padlock. */
export function agentLockStateIconName(lock: AgentLock): AgentLockIconName {
  return lock.approval ? 'hugeicons:ai-cloud' : 'hugeicons:square-lock-02';
}

/** The one-line state text: who approved the agent, or else who locked it. */
export function useAgentLockSummary(
  lock: MaybeRefOrGetter<AgentLock | null | undefined>,
) {
  const { t } = useI18n();

  return computed(() => {
    const current = toValue(lock);
    if (!current) return '';
    if (current.approval) {
      return t('agent.lock.banner.approved', {
        approver:
          current.approval.approvedBy?.name ?? t('agent.lock.unknownUser'),
      });
    }
    return t('agent.lock.banner.locked', {
      user: current.lockedBy?.name ?? t('agent.lock.unknownUser'),
    });
  });
}
