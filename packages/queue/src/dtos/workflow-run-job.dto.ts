interface WorkflowRunJobData {
  runId: string;
}

const WORKFLOW_RUN_JOB = 'workflow-run-job';

class WorkflowRunJobDto {
  runId: string;

  constructor(data: WorkflowRunJobData) {
    this.runId = data.runId;
  }

  static fromJSON(data: WorkflowRunJobData): WorkflowRunJobDto {
    return new WorkflowRunJobDto({
      runId: data.runId,
    });
  }

  toJSON(): WorkflowRunJobData {
    return {
      runId: this.runId,
    };
  }
}

export { WorkflowRunJobDto, WORKFLOW_RUN_JOB };
