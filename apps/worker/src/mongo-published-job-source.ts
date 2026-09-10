import type { Collection, Db } from 'mongodb';
import type { JobSearchDocument } from '@talentmatch/shared';
import type { PublishedJobSource } from './job-indexer.js';

interface PublishedJobDocument {
  readonly _id: string;
  readonly employerId: string;
  readonly title: string;
  readonly description: string;
  readonly city: string;
  readonly remote: boolean;
  readonly skills: readonly string[];
  readonly salary: { readonly min: number; readonly max: number; readonly currency: string };
  readonly status: 'draft' | 'published' | 'deleted';
  readonly publishedAt?: Date;
  readonly updatedAt: Date;
}

export class MongoPublishedJobSource implements PublishedJobSource {
  private readonly jobs: Collection<PublishedJobDocument>;

  public constructor(database: Db) {
    this.jobs = database.collection<PublishedJobDocument>('jobs');
  }

  public async findPublished(jobId: string): Promise<JobSearchDocument | null> {
    const job = await this.jobs.findOne({ _id: jobId, status: 'published' });
    if (job === null || job.publishedAt === undefined) return null;
    return {
      id: job._id,
      employerId: job.employerId,
      title: job.title,
      description: job.description,
      city: job.city,
      remote: job.remote,
      skills: job.skills,
      salary: job.salary,
      publishedAt: job.publishedAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}
