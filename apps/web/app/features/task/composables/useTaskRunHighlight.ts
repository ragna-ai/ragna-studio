import { taskRunElementId } from '~/features/task/lib/task-run-display';

const HIGHLIGHT_DURATION_MS = 2000;

/** Scrolls a run in the history into view and marks it for a moment. */
export function useTaskRunHighlight() {
  const highlightedRunId = useState<string | null>(
    'task-run-highlight',
    () => null,
  );
  const { start: scheduleClear } = useTimeoutFn(
    () => {
      highlightedRunId.value = null;
    },
    HIGHLIGHT_DURATION_MS,
    { immediate: false },
  );

  function highlightRun(runId: string) {
    document
      .getElementById(taskRunElementId(runId))
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightedRunId.value = runId;
    scheduleClear();
  }

  return { highlightedRunId, highlightRun };
}
