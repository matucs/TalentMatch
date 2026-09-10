import { Queue } from 'bullmq';
import { loadConfig } from '@talentmatch/config';
import { createLogger } from '@talentmatch/logger';
import {
  APPLICATION_SCORE_DLQ,
  APPLICATION_SCORE_QUEUE,
  JOB_INDEX_DLQ,
  JOB_INDEX_QUEUE,
  type ApplicationScoreCommand,
  type DeadLetterRecord,
  type JobIndexCommand,
  type JobIndexOperation,
} from '@talentmatch/shared';
import { z } from '@talentmatch/validation';
import { connectionFromUrl } from '../redis-connection.js';
import { decideReplay } from '../replay-decision.js';

const optionsSchema = z.object({
  queue: z.enum(['index', 'score']),
  execute: z.boolean(),
  limit: z.number().int().min(1).max(1_000),
});
const indexRecordSchema = z.object({
  command: z.object({
    eventId: z.string().min(1),
    jobId: z.string().min(1),
    operation: z.enum(['upsert', 'delete']),
  }),
  failedReason: z.string(),
  attemptsMade: z.number().int().nonnegative(),
  failedAt: z.string(),
});
const scoreRecordSchema = z.object({
  command: z.object({ eventId: z.string().min(1), applicationId: z.string().min(1) }),
  failedReason: z.string(),
  attemptsMade: z.number().int().nonnegative(),
  failedAt: z.string(),
});

const config = loadConfig();
const logger = createLogger({
  level: config.LOG_LEVEL,
  service: 'talentmatch-dlq',
  environment: config.NODE_ENV,
});
const args = process.argv.slice(2);
const options = optionsSchema.parse({
  queue: args.find((arg) => arg === 'index' || arg === 'score'),
  execute: args.includes('--execute'),
  limit: Number(args.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length) ?? 100),
});

if (!options.execute) {
  logger.info('Inspect-only mode; pass --execute to mutate queues');
}

if (options.queue === 'index') await processIndexDlq(options.limit, options.execute);
else await processScoreDlq(options.limit, options.execute);

async function processIndexDlq(limit: number, execute: boolean): Promise<void> {
  const connection = connectionFromUrl(config.REDIS_URL);
  const deadLetters = new Queue<DeadLetterRecord<JobIndexCommand>, void, JobIndexOperation>(
    JOB_INDEX_DLQ,
    { connection },
  );
  const source = new Queue<JobIndexCommand, void, JobIndexOperation>(JOB_INDEX_QUEUE, { connection });
  try {
    const jobs = await deadLetters.getJobs(['waiting'], 0, limit - 1, true);
    for (const deadJob of jobs) {
      const record = indexRecordSchema.parse(deadJob.data);
      const existing = await source.getJob(record.command.eventId);
      const state = existing === undefined ? null : await existing.getState();
      const action = decideReplay(state);
      logger.info({
        queue: 'index', eventId: record.command.eventId, action, state,
        failedReason: record.failedReason, failedAt: record.failedAt,
      }, 'Dead-letter record inspected');
      if (!execute || action === 'blocked') continue;
      if (action === 'already_scheduled') {
        await deadJob.remove();
        continue;
      }
      if (action === 'replace_failed' && existing !== undefined) await existing.remove();
      await source.add(record.command.operation, record.command, queueOptions(record.command.eventId));
      await deadJob.remove();
    }
    logger.info({ queue: 'index', inspected: jobs.length, execute }, 'DLQ operation completed');
  } finally {
    await Promise.allSettled([deadLetters.close(), source.close()]);
  }
}

async function processScoreDlq(limit: number, execute: boolean): Promise<void> {
  const connection = connectionFromUrl(config.REDIS_URL);
  const deadLetters = new Queue<DeadLetterRecord<ApplicationScoreCommand>, void, 'score'>(
    APPLICATION_SCORE_DLQ,
    { connection },
  );
  const source = new Queue<ApplicationScoreCommand, void, 'score'>(
    APPLICATION_SCORE_QUEUE,
    { connection },
  );
  try {
    const jobs = await deadLetters.getJobs(['waiting'], 0, limit - 1, true);
    for (const deadJob of jobs) {
      const record = scoreRecordSchema.parse(deadJob.data);
      const existing = await source.getJob(record.command.eventId);
      const state = existing === undefined ? null : await existing.getState();
      const action = decideReplay(state);
      logger.info({
        queue: 'score', eventId: record.command.eventId, action, state,
        failedReason: record.failedReason, failedAt: record.failedAt,
      }, 'Dead-letter record inspected');
      if (!execute || action === 'blocked') continue;
      if (action === 'already_scheduled') {
        await deadJob.remove();
        continue;
      }
      if (action === 'replace_failed' && existing !== undefined) await existing.remove();
      await source.add('score', record.command, queueOptions(record.command.eventId));
      await deadJob.remove();
    }
    logger.info({ queue: 'score', inspected: jobs.length, execute }, 'DLQ operation completed');
  } finally {
    await Promise.allSettled([deadLetters.close(), source.close()]);
  }
}

function queueOptions(eventId: string) {
  return {
    jobId: eventId,
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 1_000 },
    removeOnComplete: { age: 86_400, count: 10_000 },
    removeOnFail: false,
  };
}
