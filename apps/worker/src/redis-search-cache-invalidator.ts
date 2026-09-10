import type { Redis } from 'ioredis';
import { SEARCH_CACHE_VERSION_KEY } from '@talentmatch/shared';
import type { SearchCacheInvalidator } from './job-indexer.js';

export class RedisSearchCacheInvalidator implements SearchCacheInvalidator {
  public constructor(private readonly redis: Redis) {}

  public async invalidate(): Promise<void> {
    await this.redis.incr(SEARCH_CACHE_VERSION_KEY);
  }
}
