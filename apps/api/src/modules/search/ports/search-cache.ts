import type { JobSearchQuery, JobSearchResult } from '../domain/search.js';

export interface SearchCache {
  get(query: JobSearchQuery): Promise<JobSearchResult | null>;
  set(query: JobSearchQuery, result: JobSearchResult): Promise<void>;
  invalidate(): Promise<void>;
}
