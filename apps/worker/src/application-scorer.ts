import type { ApplicationScoreCommand, MatchScore } from '@talentmatch/shared';
import { calculateMatchScore, type ScoreCandidate, type ScoreJob } from './calculate-match-score.js';

export interface ScoringInput {
  readonly candidate: ScoreCandidate;
  readonly job: ScoreJob;
}

export interface ApplicationScoreStore {
  findScoring(command: ApplicationScoreCommand): Promise<ScoringInput | null>;
  complete(command: ApplicationScoreCommand, score: MatchScore, completedAt: Date): Promise<void>;
  fail(command: ApplicationScoreCommand, failedAt: Date): Promise<void>;
}

export class ApplicationScorer {
  public constructor(
    private readonly store: ApplicationScoreStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async process(command: ApplicationScoreCommand): Promise<void> {
    const input = await this.store.findScoring(command);
    if (input === null) return;
    const score = calculateMatchScore(input.candidate, input.job);
    await this.store.complete(command, score, this.now());
  }
}
