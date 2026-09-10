import { loadConfig } from '@talentmatch/config';
import { createLogger } from '@talentmatch/logger';
import { MongoClient } from 'mongodb';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import {
  JOB_INDEX_DLQ,
  JOB_INDEX_QUEUE,
  APPLICATION_SCORE_DLQ,
  APPLICATION_SCORE_QUEUE,
  type ApplicationScoreCommand,
  type DeadLetterRecord,
  type JobIndexCommand,
  type JobIndexOperation,
} from '@talentmatch/shared';
import { BullMqCommandQueue } from './bullmq-command-queue.js';
import { JobIndexer } from './job-indexer.js';
import { MongoPublishedJobSource } from './mongo-published-job-source.js';
import { MongoPendingEventStore } from './mongo-pending-event-store.js';
import { OpenSearchJobIndex } from './opensearch-job-index.js';
import { OutboxRelay } from './outbox-relay.js';
import { RedisSearchCacheInvalidator } from './redis-search-cache-invalidator.js';
import { connectionFromUrl } from './redis-connection.js';
import { ApplicationScorer } from './application-scorer.js';
import { BullMqScoreCommandQueue } from './bullmq-score-command-queue.js';
import { MongoApplicationScoreStore } from './mongo-application-score-store.js';
import { MongoPendingScoreStore } from './mongo-pending-score-store.js';
import { createOpenSearchClient } from './opensearch-client.js';

const config = loadConfig();
const logger = createLogger({
  level: config.LOG_LEVEL,
  service: 'talentmatch-worker',
  environment: config.NODE_ENV,
});
const mongo = new MongoClient(config.MONGODB_URI, {
  connectTimeoutMS: config.DEPENDENCY_TIMEOUT_MS,
  serverSelectionTimeoutMS: config.DEPENDENCY_TIMEOUT_MS,
});
const search = createOpenSearchClient(
  config.OPENSEARCH_NODE,
  config.DEPENDENCY_TIMEOUT_MS,
  config.OPENSEARCH_AWS_REGION,
);
const cacheRedis = new Redis(config.REDIS_URL, {
  connectTimeout: config.DEPENDENCY_TIMEOUT_MS,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});
await Promise.all([mongo.connect(), search.ping(), cacheRedis.connect()]);
const queue = new BullMqCommandQueue(config.REDIS_URL);
const scoreCommandQueue = new BullMqScoreCommandQueue(config.REDIS_URL);
const pendingEventStore = new MongoPendingEventStore(mongo.db());
await pendingEventStore.ensureIndexes();
const pendingScoreStore = new MongoPendingScoreStore(mongo.db());
await pendingScoreStore.ensureIndexes();
const searchIndex = new OpenSearchJobIndex(search);
await searchIndex.ensureExists();
const indexer = new JobIndexer(
  new MongoPublishedJobSource(mongo.db()),
  searchIndex,
  new RedisSearchCacheInvalidator(cacheRedis),
);
const deadLetterQueue = new Queue<DeadLetterRecord<JobIndexCommand>, void, JobIndexOperation>(
  JOB_INDEX_DLQ,
  {
  connection: connectionFromUrl(config.REDIS_URL),
  },
);
const indexWorker = new Worker<JobIndexCommand, void, JobIndexOperation>(
  JOB_INDEX_QUEUE,
  async (job) => {
    const startedAt = performance.now();
    const context = {
      jobId: job.id ?? job.data.eventId,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
    };
    try {
      await indexer.process(job.data);
      logger.info({ ...context, duration: performance.now() - startedAt }, 'Index job completed');
    } catch (error) {
      logger.error(
        { ...context, err: error, duration: performance.now() - startedAt },
        'Index job failed',
      );
      throw error;
    }
  },
  { connection: connectionFromUrl(config.REDIS_URL), concurrency: 10 },
);

indexWorker.on('failed', (job, error) => {
  if (job !== undefined) void moveToDeadLetterIfExhausted(job, error);
});

async function moveToDeadLetterIfExhausted(
  job: Job<JobIndexCommand, void, JobIndexOperation>,
  error: Error,
): Promise<void> {
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < attempts) return;
  try {
    await deadLetterQueue.add(job.name, {
      command: job.data,
      failedReason: error.message,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    }, { jobId: job.data.eventId, removeOnComplete: false, removeOnFail: false });
    logger.error({
      jobId: job.id ?? job.data.eventId,
      jobName: job.name,
      attempt: job.attemptsMade,
    }, 'Index job moved to dead-letter queue');
  } catch (deadLetterError) {
    logger.fatal({ err: deadLetterError, jobId: job.id }, 'Failed to preserve exhausted index job');
  }
}
const relay = new OutboxRelay(
  pendingEventStore,
  queue,
  {
    delivered: (command, duration) => {
      logger.info({ ...command, duration }, 'Outbox event delivered');
    },
    failed: (command, error, duration) => {
      logger.error({ ...command, err: error, duration }, 'Outbox event delivery failed');
    },
  },
);
const scoreRelay = new OutboxRelay(
  pendingScoreStore,
  scoreCommandQueue,
  {
    delivered: (command, duration) => {
      logger.info({ ...command, duration }, 'Score outbox event delivered');
    },
    failed: (command, error, duration) => {
      logger.error({ ...command, err: error, duration }, 'Score outbox event delivery failed');
    },
  },
);

const scoreDeadLetterQueue = new Queue<DeadLetterRecord<ApplicationScoreCommand>, void, 'score'>(
  APPLICATION_SCORE_DLQ,
  { connection: connectionFromUrl(config.REDIS_URL) },
);
const applicationScoreStore = new MongoApplicationScoreStore(mongo.db());
const applicationScorer = new ApplicationScorer(applicationScoreStore);
const scoreWorker = new Worker<ApplicationScoreCommand, void, 'score'>(
  APPLICATION_SCORE_QUEUE,
  async (job) => {
    const startedAt = performance.now();
    const context = {
      jobId: job.id ?? job.data.eventId,
      jobName: job.name,
      attempt: job.attemptsMade + 1,
    };
    try {
      await applicationScorer.process(job.data);
      logger.info({ ...context, duration: performance.now() - startedAt }, 'Score job completed');
    } catch (error) {
      logger.error(
        { ...context, err: error, duration: performance.now() - startedAt },
        'Score job failed',
      );
      throw error;
    }
  },
  { connection: connectionFromUrl(config.REDIS_URL), concurrency: 10 },
);

scoreWorker.on('failed', (job, error) => {
  if (job !== undefined) void moveScoreToDeadLetterIfExhausted(job, error);
});

async function moveScoreToDeadLetterIfExhausted(
  job: Job<ApplicationScoreCommand, void, 'score'>,
  error: Error,
): Promise<void> {
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < attempts) return;
  try {
    await scoreDeadLetterQueue.add('score', {
      command: job.data,
      failedReason: error.message,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    }, { jobId: job.data.eventId, removeOnComplete: false, removeOnFail: false });
    await applicationScoreStore.fail(job.data, new Date());
    logger.error({
      jobId: job.id ?? job.data.eventId,
      jobName: job.name,
      attempt: job.attemptsMade,
    }, 'Score job moved to dead-letter queue');
  } catch (deadLetterError) {
    logger.fatal({ err: deadLetterError, jobId: job.id }, 'Failed to preserve exhausted score job');
  }
}

let shuttingDown = false;
let nextPoll: NodeJS.Timeout | undefined;
let currentPoll: Promise<void> = Promise.resolve();

function schedulePoll(delay: number): void {
  nextPoll = setTimeout(() => {
    currentPoll = poll();
  }, delay);
  nextPoll.unref();
}

async function poll(): Promise<void> {
  if (shuttingDown) return;
  try {
    await Promise.all([
      relay.runOnce(config.OUTBOX_BATCH_SIZE),
      scoreRelay.runOnce(config.OUTBOX_BATCH_SIZE),
    ]);
  } catch (error) {
    logger.error({ err: error }, 'Outbox poll failed');
  } finally {
    if (!shuttingDown) schedulePoll(config.OUTBOX_POLL_INTERVAL_MS);
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (nextPoll !== undefined) clearTimeout(nextPoll);
  logger.info({ signal }, 'Worker shutdown started');

  const forceExit = setTimeout(() => {
    logger.fatal('Worker shutdown timed out');
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  await currentPoll;
  await indexWorker.close();
  await scoreWorker.close();
  await deadLetterQueue.close();
  await scoreDeadLetterQueue.close();
  await queue.close();
  await scoreCommandQueue.close();
  await Promise.allSettled([mongo.close(), search.close(), cacheRedis.quit()]);
  clearTimeout(forceExit);
  logger.info('Worker shutdown completed');
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
logger.info('Worker outbox relays, index processor, and score processor started');
schedulePoll(0);
