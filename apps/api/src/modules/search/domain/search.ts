import type { JobSearchDocument } from '@talentmatch/shared';

export type SearchSort = 'newest' | 'relevance' | 'salary_asc' | 'salary_desc';

export interface JobSearchQuery {
  readonly keyword?: string | undefined;
  readonly city?: string | undefined;
  readonly remote?: boolean | undefined;
  readonly skills: readonly string[];
  readonly salaryMin?: number | undefined;
  readonly salaryMax?: number | undefined;
  readonly page: number;
  readonly limit: number;
  readonly sort: SearchSort;
}

export interface JobSearchResult {
  readonly items: readonly JobSearchDocument[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly pages: number;
}

export interface SearchResponse {
  readonly result: JobSearchResult;
  readonly cache: 'HIT' | 'MISS';
}
