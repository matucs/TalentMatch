import type { JobSearchQuery, JobSearchResult } from '../domain/search.js';

export interface JobSearchRepository {
  search(query: JobSearchQuery): Promise<JobSearchResult>;
  autocomplete(prefix: string, limit: number): Promise<readonly string[]>;
}
