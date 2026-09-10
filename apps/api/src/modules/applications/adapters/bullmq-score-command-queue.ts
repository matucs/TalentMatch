import { Queue } from 'bullmq';
import {
  APPLICATION_SCORE_QUEUE,
  type ApplicationScoreCommand,
} from '@talentmatch/shared';
import { redisConnectionFromUrl } from '../../../adapters/redis-connection.js';
import type { ScoreCommandQueue } from '../ports/score-command-queue.js';

export class BullMqScoreCommandQueue implements ScoreCommandQueue {
  private readonly queue: Queue<ApplicationScoreCommand, void, 'score'>;

  public constructor(redisUrl: string) {
    this.queue = new Queue<ApplicationScoreCommand, void, 'score'>(APPLICATION_SCORE_QUEUE, {
      connection: redisConnectionFromUrl(redisUrl),
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
