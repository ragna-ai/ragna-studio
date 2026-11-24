const HIGHLIGHT_DURATION_MS = 2000;

/** Marks a run in the history for a moment; the run item scrolls itself into view. */
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
    highlightedRunId.value = runId;
    scheduleClear();
  }

  return { highlightedRunId, highlightRun };
}
