interface WorkflowScheduleTickJobData {
  workflowId: string;
}

const WORKFLOW_SCHEDULE_TICK_JOB = 'workflow-schedule-tick-job';

class WorkflowScheduleTickJobDto {
  workflowId: string;

  constructor(data: WorkflowScheduleTickJobData) {
    this.workflowId = data.workflowId;
  }

  static fromJSON(data: WorkflowScheduleTickJobData): WorkflowScheduleTickJobDto {
    return new WorkflowScheduleTickJobDto({
      workflowId: data.workflowId,
    });
  }

  toJSON(): WorkflowScheduleTickJobData {
    return {
      workflowId: this.workflowId,
    };
  }
}

export { WorkflowScheduleTickJobDto, WORKFLOW_SCHEDULE_TICK_JOB };
