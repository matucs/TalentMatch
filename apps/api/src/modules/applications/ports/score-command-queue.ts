import type { ApplicationScoreCommand } from '@talentmatch/shared';

export interface ScoreCommandQueue {
  enqueue(command: ApplicationScoreCommand): Promise<void>;
}
