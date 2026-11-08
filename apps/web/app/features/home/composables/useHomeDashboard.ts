import { useHomeOverview } from '~/features/home/composables/useHomeOverview';
import { sortByDueDate, tasksDueOn } from '~/features/home/lib/dashboard';

export function useHomeDashboard() {
  const { t } = useI18n();
  const { data, pending } = useHomeOverview();

  const tasks = computed(() => sortByDueDate(data.value?.tasks.items ?? []));
  const tasksTotal = computed(() => data.value?.tasks.total ?? 0);
  const workflows = computed(() => data.value?.workflows.items ?? []);
  const workflowsTotal = computed(() => data.value?.workflows.total ?? 0);
  const agents = computed(() => data.value?.agents.items ?? []);
  const agentsTotal = computed(() => data.value?.agents.total ?? 0);
  const todayTasks = computed(() =>
    tasksDueOn(data.value?.calendarTasks ?? [], new Date()),
  );
  const failedWorkflowCount = computed(
    () => workflows.value.filter((w) => w.lastRunStatus === 'failed').length,
  );

  const summary = computed(() => {
    const sentences: string[] = [];
    if (todayTasks.value.length > 0) {
      sentences.push(
        t('home.dashboard.summary.dueToday', todayTasks.value.length),
      );
    }
    if (failedWorkflowCount.value > 0) {
      sentences.push(
        t('home.dashboard.summary.failed', failedWorkflowCount.value),
      );
    }
    return sentences.length > 0
      ? sentences.join(' ')
      : t('home.dashboard.summary.nothingDue');
  });

  return {
    pending,
    summary,
    tasks,
    tasksTotal,
    workflows,
    workflowsTotal,
    agents,
    agentsTotal,
    todayTasks,
  };
}
