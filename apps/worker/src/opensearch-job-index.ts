import type { Client } from '@opensearch-project/opensearch';
import {
  createJobSearchIndexDefinition,
  JOB_SEARCH_INDEX,
  type JobSearchDocument,
} from '@talentmatch/shared';
import type { JobSearchIndex } from './job-indexer.js';

export class OpenSearchJobIndex implements JobSearchIndex {
  public constructor(private readonly client: Client) {}

  public async ensureExists(): Promise<void> {
    const exists = await this.client.indices.exists({ index: JOB_SEARCH_INDEX });
    if (exists.body) return;
    try {
      await this.client.indices.create({
        index: JOB_SEARCH_INDEX,
        body: createJobSearchIndexDefinition(),
      });
    } catch (error) {
      const createdByPeer = await this.client.indices.exists({ index: JOB_SEARCH_INDEX });
      if (!createdByPeer.body) throw error;
    }
  }

  public async upsert(document: JobSearchDocument): Promise<void> {
    await this.ensureExists();
    await this.client.index({
      index: JOB_SEARCH_INDEX,
      id: document.id,
      body: {
        ...document,
        '@timestamp': document.publishedAt,
      },
    });
  }

  public async delete(jobId: string): Promise<void> {
    try {
      await this.client.delete({ index: JOB_SEARCH_INDEX, id: jobId });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('meta' in error)) return false;
  const meta = error.meta;
  if (typeof meta !== 'object' || meta === null || !('statusCode' in meta)) return false;
  return meta.statusCode === 404;
}
