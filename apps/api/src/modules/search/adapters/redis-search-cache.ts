import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { SEARCH_CACHE_VERSION_KEY } from '@talentmatch/shared';
import type { JobSearchQuery, JobSearchResult } from '../domain/search.js';
import type { SearchCache } from '../ports/search-cache.js';
import { jobSearchResultSchema } from '../validation/search-schemas.js';

export class RedisSearchCache implements SearchCache {
  public constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  public async get(query: JobSearchQuery): Promise<JobSearchResult | null> {
    const version = await this.currentVersion();
    const serialized = await this.redis.get(cacheKey(version, query));
    if (serialized === null) return null;
    try {
      return jobSearchResultSchema.parse(JSON.parse(serialized));
    } catch {
      await this.redis.del(cacheKey(version, query));
      return null;
    }
  }

  public async set(query: JobSearchQuery, result: JobSearchResult): Promise<void> {
    const version = await this.currentVersion();
    await this.redis.set(cacheKey(version, query), JSON.stringify(result), 'EX', this.ttlSeconds);
  }

  public async invalidate(): Promise<void> {
    await this.redis.incr(SEARCH_CACHE_VERSION_KEY);
  }

  private async currentVersion(): Promise<string> {
    return (await this.redis.get(SEARCH_CACHE_VERSION_KEY)) ?? '0';
  }
}

function cacheKey(version: string, query: JobSearchQuery): string {
  const canonical = JSON.stringify({
    keyword: query.keyword ?? null,
    city: query.city ?? null,
    remote: query.remote ?? null,
    skills: query.skills,
    salaryMin: query.salaryMin ?? null,
    salaryMax: query.salaryMax ?? null,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
  const digest = createHash('sha256').update(canonical).digest('hex');
  return `search:v${version}:${digest}`;
}
