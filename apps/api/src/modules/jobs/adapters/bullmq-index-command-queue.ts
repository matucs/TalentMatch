import { Queue } from 'bullmq';
import {
  JOB_INDEX_QUEUE,
  type JobIndexCommand,
  type JobIndexOperation,
} from '@talentmatch/shared';
import type { IndexCommandQueue } from '../ports/index-command-queue.js';
import { redisConnectionFromUrl } from '../../../adapters/redis-connection.js';

export class BullMqIndexCommandQueue implements IndexCommandQueue {
  private readonly queue: Queue<JobIndexCommand, void, JobIndexOperation>;

  public constructor(redisUrl: string) {
    this.queue = new Queue<JobIndexCommand, void, JobIndexOperation>(JOB_INDEX_QUEUE, {
      connection: redisConnectionFromUrl(redisUrl),
    });
  }

  public async enqueue(command: JobIndexCommand): Promise<void> {
    await this.queue.add(command.operation, command, {
      jobId: command.eventId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: { age: 86_400, count: 10_000 },
      removeOnFail: false,
    });
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}
