import { Queue } from 'bullmq';
import { APPLICATION_SCORE_QUEUE, type ApplicationScoreCommand } from '@talentmatch/shared';
import type { CommandQueue } from './outbox-relay.js';
import { connectionFromUrl } from './redis-connection.js';

export class BullMqScoreCommandQueue implements CommandQueue<ApplicationScoreCommand> {
  private readonly queue: Queue<ApplicationScoreCommand, void, 'score'>;

  public constructor(redisUrl: string) {
    this.queue = new Queue<ApplicationScoreCommand, void, 'score'>(APPLICATION_SCORE_QUEUE, {
      connection: connectionFromUrl(redisUrl),
    });
  }

  public async enqueue(command: ApplicationScoreCommand): Promise<void> {
    await this.queue.add('score', command, {
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
