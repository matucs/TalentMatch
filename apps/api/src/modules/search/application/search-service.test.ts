import { describe, expect, it, vi } from 'vitest';
import type { JobSearchQuery, JobSearchResult } from '../domain/search.js';
import { SearchService } from './search-service.js';

const query: JobSearchQuery = {
  keyword: 'backend', skills: ['typescript'], page: 1, limit: 20, sort: 'relevance',
};
const emptyResult: JobSearchResult = { items: [], total: 0, page: 1, limit: 20, pages: 0 };
const result: JobSearchResult = {
  items: [{
    id: 'job-1',
    employerId: 'employer-1',
    title: 'Backend Engineer',
    description: 'Build reliable systems.',
    city: 'Vienna',
    remote: true,
    skills: ['typescript'],
    salary: { min: 80_000, max: 105_000, currency: 'EUR' },
    publishedAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-20T10:00:00.000Z',
  }],
  total: 1,
  page: 1,
  limit: 20,
  pages: 1,
};

describe('SearchService', () => {
  it('returns cached results without querying OpenSearch', async () => {
    const repository = { search: vi.fn(async () => result), autocomplete: vi.fn(async () => []) };
    const cache = {
      get: vi.fn(async () => result), set: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    };

    await expect(new SearchService({ repository, cache }).search(query)).resolves.toEqual({
      result, cache: 'HIT',
    });
    expect(repository.search).not.toHaveBeenCalled();
  });

  it('populates the cache after an OpenSearch miss', async () => {
    const repository = { search: vi.fn(async () => result), autocomplete: vi.fn(async () => []) };
    const cache = {
      get: vi.fn(async () => null), set: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    };

    await expect(new SearchService({ repository, cache }).search(query)).resolves.toEqual({
      result, cache: 'MISS',
    });
    expect(cache.set).toHaveBeenCalledWith(query, result);
  });

  it('does not cache empty OpenSearch results', async () => {
    const repository = { search: vi.fn(async () => emptyResult), autocomplete: vi.fn(async () => []) };
    const cache = {
      get: vi.fn(async () => null), set: vi.fn(async () => undefined),
      invalidate: vi.fn(async () => undefined),
    };

    await expect(new SearchService({ repository, cache }).search(query)).resolves.toEqual({
      result: emptyResult, cache: 'MISS',
    });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('degrades to OpenSearch when Redis is unavailable', async () => {
    const repository = { search: vi.fn(async () => result), autocomplete: vi.fn(async () => []) };
    const cache = {
      get: vi.fn(async () => { throw new Error('Redis offline'); }),
      set: vi.fn(async () => undefined), invalidate: vi.fn(async () => undefined),
    };
    const onCacheError = vi.fn();

    await expect(new SearchService({ repository, cache, onCacheError }).search(query)).resolves
      .toMatchObject({ cache: 'MISS' });
    expect(repository.search).toHaveBeenCalledOnce();
    expect(onCacheError).toHaveBeenCalledWith(expect.any(Error), 'get');
  });
});
