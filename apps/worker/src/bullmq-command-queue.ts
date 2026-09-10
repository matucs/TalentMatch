import { Queue } from 'bullmq';
import {
  JOB_INDEX_QUEUE,
  type JobIndexCommand,
  type JobIndexOperation,
} from '@talentmatch/shared';
import type { CommandQueue } from './outbox-relay.js';
import { connectionFromUrl } from './redis-connection.js';

export class BullMqCommandQueue implements CommandQueue<JobIndexCommand> {
  private readonly queue: Queue<JobIndexCommand, void, JobIndexOperation>;

  public constructor(redisUrl: string) {
    this.queue = new Queue<JobIndexCommand, void, JobIndexOperation>(JOB_INDEX_QUEUE, {
      connection: connectionFromUrl(redisUrl),
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
