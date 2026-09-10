import type { JobIndexCommand, JobSearchDocument } from '@talentmatch/shared';

export interface PublishedJobSource {
  findPublished(jobId: string): Promise<JobSearchDocument | null>;
}

export interface JobSearchIndex {
  upsert(document: JobSearchDocument): Promise<void>;
  delete(jobId: string): Promise<void>;
}

export interface SearchCacheInvalidator {
  invalidate(): Promise<void>;
}

export class JobIndexer {
  public constructor(
    private readonly source: PublishedJobSource,
    private readonly index: JobSearchIndex,
    private readonly cache: SearchCacheInvalidator,
  ) {}

  public async process(command: JobIndexCommand): Promise<void> {
    if (command.operation === 'delete') {
      await this.index.delete(command.jobId);
    } else {
      const document = await this.source.findPublished(command.jobId);
      if (document === null) await this.index.delete(command.jobId);
      else await this.index.upsert(document);
    }
    await this.cache.invalidate();
  }
}
