import type { Collection, Db } from 'mongodb';
import type { JobIndexCommand, JobIndexOperation } from '@talentmatch/shared';
import type { PendingEventStore } from './outbox-relay.js';

interface OutboxJobDocument {
  readonly _id: string;
  readonly indexSync?: {
    readonly eventId: string;
    readonly operation: JobIndexOperation;
    readonly pendingSince: Date;
    readonly dispatchedAt?: Date;
  };
}

export class MongoPendingEventStore implements PendingEventStore<JobIndexCommand> {
  private readonly jobs: Collection<OutboxJobDocument>;

  public constructor(database: Db) {
    this.jobs = database.collection<OutboxJobDocument>('jobs');
  }

  public async ensureIndexes(): Promise<void> {
    await this.jobs.createIndex(
      { 'indexSync.dispatchedAt': 1, 'indexSync.pendingSince': 1 },
      { name: 'pending_index_events' },
    );
  }

  public async findPending(limit: number): Promise<readonly JobIndexCommand[]> {
    const documents = await this.jobs.find(
      { indexSync: { $exists: true }, 'indexSync.dispatchedAt': { $exists: false } },
      { projection: { _id: 1, indexSync: 1 } },
    ).sort({ 'indexSync.pendingSince': 1 }).limit(limit).toArray();

    return documents.flatMap((document) => document.indexSync === undefined ? [] : [{
      eventId: document.indexSync.eventId,
      jobId: document._id,
      operation: document.indexSync.operation,
    }]);
  }

  public async markDispatched(command: JobIndexCommand, dispatchedAt: Date): Promise<void> {
    await this.jobs.updateOne(
      { _id: command.jobId, 'indexSync.eventId': command.eventId },
      { $set: { 'indexSync.dispatchedAt': dispatchedAt } },
    );
  }
}
