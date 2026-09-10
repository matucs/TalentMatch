import type { Collection, Db } from 'mongodb';
import type { ApplicationScoreCommand } from '@talentmatch/shared';
import type { PendingEventStore } from './outbox-relay.js';

interface ScoreOutboxDocument {
  readonly _id: string;
  readonly scoreSync?: {
    readonly eventId: string;
    readonly pendingSince: Date;
    readonly dispatchedAt?: Date;
  };
}

export class MongoPendingScoreStore implements PendingEventStore<ApplicationScoreCommand> {
  private readonly applications: Collection<ScoreOutboxDocument>;

  public constructor(database: Db) {
    this.applications = database.collection<ScoreOutboxDocument>('applications');
  }

  public async ensureIndexes(): Promise<void> {
    await this.applications.createIndex(
      { 'scoreSync.dispatchedAt': 1, 'scoreSync.pendingSince': 1 },
      { name: 'pending_score_events' },
    );
  }

  public async findPending(limit: number): Promise<readonly ApplicationScoreCommand[]> {
    const documents = await this.applications.find(
      { scoreSync: { $exists: true }, 'scoreSync.dispatchedAt': { $exists: false } },
      { projection: { _id: 1, scoreSync: 1 } },
    ).sort({ 'scoreSync.pendingSince': 1 }).limit(limit).toArray();
    return documents.flatMap((document) => document.scoreSync === undefined ? [] : [{
      eventId: document.scoreSync.eventId,
      applicationId: document._id,
    }]);
  }

  public async markDispatched(
    command: ApplicationScoreCommand,
    dispatchedAt: Date,
  ): Promise<void> {
    await this.applications.updateOne(
      { _id: command.applicationId, 'scoreSync.eventId': command.eventId },
      { $set: { 'scoreSync.dispatchedAt': dispatchedAt } },
    );
  }
}
