import { config } from '@repo/config';
import { logger } from '@repo/logger';
import type {
  ConnectionOptions,
  FlowJobNode,
  JobSchedulerJson,
  JobSchedulerTemplateOptions,
  JobsOptions,
  Processor,
  QueueOptions,
  RedisOptions,
  RepeatOptions,
  WorkerOptions,
} from 'bullmq';
import { FlowProducer, Queue, Worker } from 'bullmq';
import { CRON_QUEUE_NAME } from '../constants';

const queues: Queue[] = [];
const workers: Worker[] = [];
const cronJobs: {
  name: string;
  processor: () => Promise<void>;
  schedule: RepeatOptions;
}[] = [];

const connectionOptions: ConnectionOptions = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.getSecret('REDIS_PASSWORD'),
  db: config.redisDb,
};

const redisOptions: RedisOptions = {
  ...connectionOptions,
  retryStrategy: (times: number) => Math.max(Math.min(Math.exp(times), 20000), 1000),
};

const defaultJobOptions: Partial<JobsOptions> = {
  attempts: 1,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 3600, // keep up to 1 hour
    count: 100, // keep up to 100 jobs
  },
  removeOnFail: {
    age: 24 * 3600, // keep up to 24 hours
  },
};

export function createQueue({
  name,
  opts,
}: {
  name: string;
  opts?: Omit<QueueOptions, 'connection'>;
}) {
  // check if queue already exists
  const existingQueue = queues.find((queue) => queue.name === name);
  if (existingQueue) {
    logger.warn(`Queue ${name} already exists`);
    return existingQueue;
  }
  const defaultConnectionOptions: ConnectionOptions = {
    enableOfflineQueue: false,
  };

  const queue = new Queue(name, {
    connection: { ...redisOptions, ...defaultConnectionOptions },
    ...opts,
  });

  queues.push(queue);

  return queue;
}

/**
 * Adds a job to the specified queue.
 * @deprecated Use queue factory queue.name().add(...) instead
 */
export function queueAddJob<T>({
  queueName,
  jobName,
  data,
  opts,
}: {
  queueName: string;
  jobName: string;
  data: T;
  opts?: { delay?: number; attempts?: number };
}) {
  const queue = getOrCreateQueue({ name: queueName });
  return queue.add(jobName, data, { ...defaultJobOptions, ...opts });
}

/**
 * Creates or updates a repeatable job scheduler. Unlike `queueAddJob`, this
 * is keyed by a caller-chosen `schedulerId` (e.g. a workflow id) rather than
 * producing a new job each call, so re-publishing a schedule just updates
 * its pattern instead of stacking schedulers.
 */
export function upsertQueueJobScheduler<T>({
  queueName,
  schedulerId,
  repeat,
  job,
}: {
  queueName: string;
  schedulerId: string;
  repeat: Pick<RepeatOptions, 'pattern' | 'tz'>;
  job: { name: string; data: T; opts?: JobSchedulerTemplateOptions };
}) {
  const queue = getOrCreateQueue({ name: queueName });
  return queue.upsertJobScheduler(schedulerId, repeat, job);
}

export function removeQueueJobScheduler({
  queueName,
  schedulerId,
}: {
  queueName: string;
  schedulerId: string;
}) {
  const queue = getOrCreateQueue({ name: queueName });
  return queue.removeJobScheduler(schedulerId);
}

export function getQueueJobSchedulers({
  queueName,
}: {
  queueName: string;
}): Promise<JobSchedulerJson[]> {
  const queue = getOrCreateQueue({ name: queueName });
  return queue.getJobSchedulers();
}

export function createWorker({
  name,
  processor,
  opts,
}: {
  name: string;
  processor?: string | URL | null | Processor;
  opts?: Omit<WorkerOptions, 'connection'>;
}): Worker<any, any, string> {
  // Check if worker already exists for this queue
  const existingWorker = workers.find((worker) => worker.name === name);
  if (existingWorker) {
    logger.warn(`Worker for queue ${name} already exists`);
    return existingWorker;
  }

  const defaultConnectionOptions: ConnectionOptions = {
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
  };

  const worker = new Worker(name, processor, {
    connection: { ...redisOptions, ...defaultConnectionOptions },
    ...opts,
  });

  // Listen to worker events

  worker.on('closed', () => {
    logger.info(`Worker ${name} stopped`);
  });

  worker.on('error', (err) => {
    logger.error(`Worker ${name} error:`, err);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} in queue ${name} failed:`, err);
  });

  worker.on('completed', (job) => {
    logger.debug(`Job ${job.id} in queue ${name} completed`);
  });

  workers.push(worker);

  return worker;
}

export function addCronJob({
  name,
  processor,
  schedule,
}: {
  name: string;
  processor: () => Promise<void>;
  schedule: RepeatOptions;
}) {
  cronJobs.push({
    name,
    processor,
    schedule,
  });
}

/**
 * Starts all registered cron jobs by upserting a job scheduler per cron
 * and creating a worker to process them
 */
export async function startCronJobs() {
  if (cronJobs.length === 0) {
    logger.info('No cron jobs to start');
    return;
  }

  // Create a map of processors for the worker
  const processorMap = new Map<string, () => Promise<void>>();
  for (const cronJob of cronJobs) {
    processorMap.set(cronJob.name, cronJob.processor);
  }

  // Upsert a job scheduler per registered cron, keyed by cron name. Unlike
  // the legacy repeatable job add (queue.add(..., { repeat })), a scheduler
  // upsert is keyed by this id and updates the schedule in place, so editing
  // a cron's pattern no longer leaves the previous repeat entry behind.
  for (const cronJob of cronJobs) {
    await upsertQueueJobScheduler({
      queueName: CRON_QUEUE_NAME,
      schedulerId: cronJob.name,
      repeat: cronJob.schedule,
      job: {
        name: cronJob.name,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: { age: 24 * 3600 } },
      },
    });
    logger.info(`Cron job ${cronJob.name} scheduled`);
  }

  // Reconcile: remove any scheduler whose id isn't a currently registered
  // cron name. This clears entries left behind by renamed/removed crons, and
  // also legacy repeatable jobs from before this migration to job schedulers,
  // since those are keyed by a generated `name:...:pattern` string that never
  // matches a plain registered cron name.
  const registeredCronNames = new Set(cronJobs.map((cronJob) => cronJob.name));
  const existingSchedulers = await getQueueJobSchedulers({ queueName: CRON_QUEUE_NAME });
  const orphanedSchedulerIds = existingSchedulers
    .map((scheduler) => scheduler.key)
    .filter((schedulerId) => !registeredCronNames.has(schedulerId));

  for (const schedulerId of orphanedSchedulerIds) {
    await removeQueueJobScheduler({ queueName: CRON_QUEUE_NAME, schedulerId });
    logger.info(`Removed orphaned cron scheduler ${schedulerId}`);
  }

  // Create worker to process cron jobs
  createWorker({
    name: CRON_QUEUE_NAME,
    processor: async (job) => {
      const processor = processorMap.get(job.name);
      if (processor) {
        await processor();
      } else {
        logger.warn(`No processor found for cron job ${job.name}`);
      }
    },
  });

  logger.info(`Started ${cronJobs.length} cron job(s)`);
}

/**
 * Returns the a queue by name. If queue is not found, it will return null.
 *
 * @param name Name of the queue
 */
export function getQueue({ name }: { name: string }): Queue | null {
  const queue = queues.find((queue) => queue.name === name);

  if (!queue) {
    return null;
  }

  return queue;
}

export function getOrCreateQueue({
  name,
  opts,
}: {
  name: string;
  opts?: Omit<QueueOptions, 'connection'>;
}) {
  return getQueue({ name }) ?? createQueue({ name, opts });
}

export function getCronJob({ name }: { name: string }) {
  return cronJobs.find((cronJob) => cronJob.name === name);
}

let flowProducer: FlowProducer | null = null;

/**
 * Returns singleton FlowProducer instance
 */
export function getFlowProducer() {
  if (!flowProducer) {
    flowProducer = new FlowProducer({
      connection: connectionOptions,
    });
  }
  return flowProducer;
}

/**
 * Create a job flow with parent-child relationships
 */
export async function createFlow({
  parentName,
  parentQueueName,
  flowChildJobs,
}: {
  parentName: string;
  parentQueueName: string;
  flowChildJobs: FlowJobNode[];
}) {
  const producer = getFlowProducer();
  const queue = getOrCreateQueue({ name: parentQueueName });
  const flow = await producer.add({
    name: parentName,
    queueName: queue.name,
    children: flowChildJobs,
  });
  return flow;
}

/**
 * Check if Redis connection is healthy
 */
export async function queueHealthCheck(): Promise<boolean> {
  try {
    const testQueue = getOrCreateQueue({ name: '__health_check__' });
    await testQueue.waitUntilReady();
    return true;
  } catch (error) {
    logger.error('Queue health check failed:', error);
    return false;
  }
}

/**
 * Gracefully shutdown all queues, workers, and flow producer
 */
export async function shutdown() {
  logger.info('Shutting down queue service...');

  // Close workers first (stop processing new jobs)
  await Promise.all(workers.map((w) => w.close()));

  // Close flow producer if it exists
  if (flowProducer) {
    await flowProducer.close();
    flowProducer = null;
  }

  // Close queues last
  await Promise.all(queues.map((q) => q.close()));

  // Clear arrays
  workers.length = 0;
  queues.length = 0;

  logger.info('Queue service shutdown complete');
}
