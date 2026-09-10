import type { Collection, Db } from 'mongodb';
import type { ApplicationScoreCommand, MatchScore } from '@talentmatch/shared';
import type { ApplicationScoreStore, ScoringInput } from './application-scorer.js';

interface ScoringApplicationDocument {
  readonly _id: string;
  readonly status: 'score_failed' | 'scoring' | 'scored';
  readonly profile: ScoringInput['candidate'];
  readonly jobSnapshot: ScoringInput['job'];
  readonly scoreSync: { readonly eventId: string };
}

export class MongoApplicationScoreStore implements ApplicationScoreStore {
  private readonly applications: Collection<ScoringApplicationDocument>;

  public constructor(database: Db) {
    this.applications = database.collection<ScoringApplicationDocument>('applications');
  }

  public async findScoring(command: ApplicationScoreCommand): Promise<ScoringInput | null> {
    const application = await this.applications.findOne({
      _id: command.applicationId,
      status: 'scoring',
      'scoreSync.eventId': command.eventId,
    });
    return application === null
      ? null
      : { candidate: application.profile, job: application.jobSnapshot };
  }

  public async complete(
    command: ApplicationScoreCommand,
    score: MatchScore,
    completedAt: Date,
  ): Promise<void> {
    await this.applications.updateOne(
      {
        _id: command.applicationId,
        status: 'scoring',
        'scoreSync.eventId': command.eventId,
      },
      { $set: { status: 'scored', score, updatedAt: completedAt } },
    );
  }

  public async fail(command: ApplicationScoreCommand, failedAt: Date): Promise<void> {
    await this.applications.updateOne(
      {
        _id: command.applicationId,
        status: 'scoring',
        'scoreSync.eventId': command.eventId,
      },
      { $set: { status: 'score_failed', updatedAt: failedAt } },
    );
  }
}
