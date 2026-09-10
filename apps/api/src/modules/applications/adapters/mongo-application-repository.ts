import { MongoServerError, type Collection, type Db } from 'mongodb';
import { AppError } from '@talentmatch/shared';
import type {
  Application,
  ApplicationCreation,
  CreateApplicationInput,
  StoredApplication,
} from '../domain/application.js';
import type { ApplicationRepository } from '../ports/application-repository.js';

interface ApplicationDocument extends Omit<StoredApplication, 'id'> {
  readonly _id: string;
}

export class MongoApplicationRepository implements ApplicationRepository {
  private readonly applications: Collection<ApplicationDocument>;

  public constructor(database: Db) {
    this.applications = database.collection<ApplicationDocument>('applications');
  }

  public async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.applications.createIndex(
        { candidateId: 1, idempotencyKey: 1 },
        { unique: true, name: 'candidate_idempotency_key' },
      ),
      this.applications.createIndex(
        { jobId: 1, candidateId: 1 },
        { unique: true, name: 'one_application_per_job_candidate' },
      ),
      this.applications.createIndex(
        { 'scoreSync.dispatchedAt': 1, 'scoreSync.pendingSince': 1 },
        { name: 'pending_score_events' },
      ),
    ]);
  }

  public async createIdempotent(input: CreateApplicationInput): Promise<ApplicationCreation> {
    const document: ApplicationDocument = {
      _id: input.id,
      jobId: input.jobId,
      candidateId: input.candidateId,
      profile: input.profile,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      jobSnapshot: input.jobSnapshot,
      scoreSync: { eventId: input.scoreEventId, pendingSince: input.now },
      status: 'scoring',
      createdAt: input.now,
      updatedAt: input.now,
    };
    try {
      await this.applications.insertOne(document);
      return { application: toStoredApplication(document), replayed: false };
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11_000) throw error;
      const sameKey = await this.applications.findOne({
        candidateId: input.candidateId,
        idempotencyKey: input.idempotencyKey,
      });
      if (sameKey !== null) {
        if (sameKey.requestFingerprint !== input.requestFingerprint) {
          throw new AppError('CONFLICT', 'Idempotency key was already used with different input', 409);
        }
        return { application: toStoredApplication(sameKey), replayed: true };
      }
      throw new AppError('CONFLICT', 'Candidate has already applied to this job', 409);
    }
  }

  public async findById(id: string): Promise<Application | null> {
    const document = await this.applications.findOne({ _id: id });
    return document === null ? null : toVisibleApplication(document);
  }

  public async markScoreEventDispatched(
    id: string,
    eventId: string,
    dispatchedAt: Date,
  ): Promise<void> {
    await this.applications.updateOne(
      { _id: id, 'scoreSync.eventId': eventId },
      { $set: { 'scoreSync.dispatchedAt': dispatchedAt } },
    );
  }
}

function toStoredApplication(document: ApplicationDocument): StoredApplication {
  const { _id, ...application } = document;
  return { id: _id, ...application };
}

function toVisibleApplication(document: ApplicationDocument): Application {
  return {
    id: document._id,
    jobId: document.jobId,
    candidateId: document.candidateId,
    profile: document.profile,
    status: document.status,
    ...(document.score === undefined ? {} : { score: document.score }),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
