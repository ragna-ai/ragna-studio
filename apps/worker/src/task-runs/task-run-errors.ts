/** A failure no retry can fix. `message` is shown to the user on the task. */
export class PermanentTaskRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentTaskRunError';
  }
}

export type TaskRunStopReason = 'canceled' | 'credits_ran_out' | 'agent_stuck';

const STOP_MESSAGES: Record<Exclude<TaskRunStopReason, 'canceled'>, string> = {
  credits_ran_out: 'The workspace ran out of credits during the run.',
  agent_stuck: 'The agent was stuck: it repeated the same action three times in a row.',
};

/** Thrown between steps to end a run on purpose. `canceled` is a user stop, the rest are failures. */
export class TaskRunStoppedError extends Error {
  constructor(readonly reason: TaskRunStopReason) {
    super(reason === 'canceled' ? 'The run was canceled.' : STOP_MESSAGES[reason]);
    this.name = 'TaskRunStoppedError';
  }
}

/** The run ended as failed. The processor turns it into an `UnrecoverableError`. */
export class TaskRunFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskRunFailed';
  }
}
