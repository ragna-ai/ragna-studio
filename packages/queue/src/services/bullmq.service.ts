import { config } from '@repo/config';
import { logger } from '@repo/logger';
import type {
  ConnectionOptions,
  FlowChildJob,
  JobsOptions,
  Processor,
  QueueOptions,
  RedisOptions,
  RepeatOptions,
  WorkerOptions,
} from 'bullmq';
import { FlowProducer, Queue, Worker } from 'bullmq';

const queues: Queue[] = [];
const workers: Worker[] = [];
let flowProducer: FlowProducer | null = null;
const cronJobs: {
  name: string;
  processor: () => Promise<void>;
  schedule: RepeatOptions;
}[] = [];
const CRON_QUEUE_NAME = '__cron__';

const connectionOptions: ConnectionOptions = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.getSecret('REDIS_PASSWORD'),
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

export function queueAddJob<T>({
  queueName,
  jobName,
  data,
  opts,
}: {
  queueName: string;
  jobName: string;
  data: T;
  opts?: { delay?: number };
}) {
  const queue = getOrCreateQueue({ name: queueName });
  return queue.add(jobName, data, { ...defaultJobOptions, ...opts });
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
 * Starts all registered cron jobs by adding them as repeatable jobs
 * and creating a worker to process them
 */
export async function startCronJobs() {
  if (cronJobs.length === 0) {
    logger.info('No cron jobs to start');
    return;
  }

  const cronQueue = createQueue({ name: CRON_QUEUE_NAME });

  // Create a map of processors for the worker
  const processorMap = new Map<string, () => Promise<void>>();
  for (const cronJob of cronJobs) {
    processorMap.set(cronJob.name, cronJob.processor);
  }

  // Add repeatable jobs to the queue
  for (const cronJob of cronJobs) {
    await cronQueue.add(
      cronJob.name,
      {},
      {
        repeat: cronJob.schedule,
        removeOnComplete: true,
        removeOnFail: { age: 24 * 3600 },
      },
    );
    logger.info(`Cron job ${cronJob.name} scheduled`);
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

export function getOrCreateQueue({ name }: { name: string }) {
  return getQueue({ name }) ?? createQueue({ name });
}

export function getCronJob({ name }: { name: string }) {
  return cronJobs.find((cronJob) => cronJob.name === name);
}

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
  flowChildJobs: FlowChildJob[];
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
    await testQueue.client;
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
