import type { Collection, Db } from 'mongodb';
import type {
  CreateJobInput,
  IndexSyncEvent,
  Job,
  JobMutation,
  StoredJob,
} from '../domain/job.js';
import type { JobRepository } from '../ports/job-repository.js';

interface JobDocument extends Omit<StoredJob, 'id'> {
  readonly _id: string;
}

export class MongoJobRepository implements JobRepository {
  private readonly collection: Collection<JobDocument>;

  public constructor(database: Db) {
    this.collection = database.collection<JobDocument>('jobs');
  }

  public async ensureIndexes(): Promise<void> {
    await this.collection.createIndex(
      { 'indexSync.dispatchedAt': 1, 'indexSync.pendingSince': 1 },
      { name: 'pending_index_events' },
    );
  }

  public async create(id: string, input: CreateJobInput, now: Date): Promise<Job> {
    const document: JobDocument = {
      _id: id,
      ...input,
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.collection.insertOne(document);
    return toVisibleJob(document);
  }

  public async findById(id: string): Promise<Job | null> {
    const document = await this.collection.findOne({ _id: id, status: { $ne: 'deleted' } });
    return document === null ? null : toVisibleJob(document);
  }

  public async publishDraft(
    id: string,
    eventId: string,
    now: Date,
  ): Promise<JobMutation | null> {
    const event: IndexSyncEvent = { eventId, operation: 'upsert', pendingSince: now };
    const document = await this.collection.findOneAndUpdate(
      { _id: id, status: 'draft' },
      {
        $set: { status: 'published', publishedAt: now, updatedAt: now, indexSync: event },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    return document === null ? null : { job: toStoredJob(document), event };
  }

  public async softDelete(
    id: string,
    eventId: string,
    now: Date,
  ): Promise<JobMutation | null> {
    const event: IndexSyncEvent = { eventId, operation: 'delete', pendingSince: now };
    const document = await this.collection.findOneAndUpdate(
      { _id: id, status: { $in: ['draft', 'published'] } },
      {
        $set: { status: 'deleted', deletedAt: now, updatedAt: now, indexSync: event },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    return document === null ? null : { job: toStoredJob(document), event };
  }

  public async markEventDispatched(
    id: string,
    eventId: string,
    dispatchedAt: Date,
  ): Promise<void> {
    await this.collection.updateOne(
      { _id: id, 'indexSync.eventId': eventId },
      { $set: { 'indexSync.dispatchedAt': dispatchedAt } },
    );
  }
}

function toStoredJob(document: JobDocument): StoredJob {
  const { _id, ...job } = document;
  return { id: _id, ...job };
}

function toVisibleJob(document: JobDocument): Job {
  if (document.status === 'deleted') throw new Error('Deleted jobs cannot be made visible');
  return {
    id: document._id,
    employerId: document.employerId,
    title: document.title,
    description: document.description,
    city: document.city,
    remote: document.remote,
    skills: document.skills,
    salary: document.salary,
    status: document.status,
    version: document.version,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    ...(document.publishedAt === undefined ? {} : { publishedAt: document.publishedAt }),
  };
}
