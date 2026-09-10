import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { Redis } from 'ioredis';
import { JOB_SEARCH_INDEX, type JobSearchDocument } from '@talentmatch/shared';
import { OpenSearchJobSearchRepository } from './opensearch-job-search-repository.js';
import { RedisSearchCache } from './redis-search-cache.js';
import { RedisRateLimiter } from '../../../adapters/redis-rate-limiter.js';

const integration = describe.runIf(process.env['RUN_SEARCH_INTEGRATION'] === 'true');
const search = new OpenSearchClient({
  node: process.env['OPENSEARCH_NODE'] ?? 'http://localhost:9200',
});
const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', { lazyConnect: true });
const repository = new OpenSearchJobSearchRepository(search);
const cache = new RedisSearchCache(redis, 120);

const backendJob: JobSearchDocument = {
  id: 'job-backend', employerId: 'employer-1', title: 'Senior Backend Engineer',
  description: 'Build scalable TypeScript services', city: 'Vienna', remote: true,
  skills: ['typescript', 'mongodb'], salary: { min: 80_000, max: 105_000, currency: 'EUR' },
  publishedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
};
const designJob: JobSearchDocument = {
  id: 'job-design', employerId: 'employer-2', title: 'Product Designer',
  description: 'Design candidate experiences', city: 'Berlin', remote: false,
  skills: ['figma'], salary: { min: 60_000, max: 75_000, currency: 'EUR' },
  publishedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

integration('search infrastructure', () => {
  beforeAll(async () => {
    await redis.connect();
    await repository.ensureIndexExists();
    await search.deleteByQuery({
      index: JOB_SEARCH_INDEX,
      body: { query: { match_all: {} } },
      conflicts: 'proceed',
      refresh: true,
    });
    await search.index({ index: JOB_SEARCH_INDEX, id: backendJob.id, body: backendJob, refresh: true });
    await search.index({ index: JOB_SEARCH_INDEX, id: designJob.id, body: designJob, refresh: true });
  }, 30_000);

  afterAll(async () => {
    await search.deleteByQuery({
      index: JOB_SEARCH_INDEX,
      body: { query: { match_all: {} } },
      conflicts: 'proceed',
      refresh: true,
    });
    await Promise.allSettled([redis.quit(), search.close()]);
  });

  it('combines fuzzy text, structured filters, salary overlap, sorting, and pagination', async () => {
    const result = await repository.search({
      keyword: 'Bakend', city: 'vienna', remote: true, skills: ['typescript'],
      salaryMin: 90_000, page: 1, limit: 10, sort: 'newest',
    });

    expect(result).toMatchObject({ total: 1, page: 1, limit: 10, pages: 1 });
    expect(result.items.map(({ id }) => id)).toEqual(['job-backend']);
  });

  it('provides title autocomplete', async () => {
    await expect(repository.autocomplete('Back', 5)).resolves.toContain('Senior Backend Engineer');
  });

  it('versions cache keys so invalidation makes existing entries unreachable', async () => {
    const query = { skills: [], page: 1, limit: 20, sort: 'relevance' as const };
    const result = { items: [backendJob], total: 1, page: 1, limit: 20, pages: 1 };
    await cache.set(query, result);
    await expect(cache.get(query)).resolves.toEqual(result);
    await cache.invalidate();
    await expect(cache.get(query)).resolves.toBeNull();
  });

  it('enforces an atomic distributed request quota', async () => {
    const limiter = new RedisRateLimiter(redis, 2, 60);
    const key = `integration-${Date.now()}`;
    await expect(limiter.consume(key)).resolves.toMatchObject({ allowed: true, remaining: 1 });
    await expect(limiter.consume(key)).resolves.toMatchObject({ allowed: true, remaining: 0 });
    await expect(limiter.consume(key)).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });
});
