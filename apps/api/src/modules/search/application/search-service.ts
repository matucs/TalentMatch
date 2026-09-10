import type { JobSearchQuery, SearchResponse } from '../domain/search.js';
import type { JobSearchRepository } from '../ports/job-search-repository.js';
import type { SearchCache } from '../ports/search-cache.js';

interface SearchServiceDependencies {
  readonly repository: JobSearchRepository;
  readonly cache: SearchCache;
  readonly onCacheError?: (error: unknown, operation: 'get' | 'set') => void;
}

export class SearchService {
  public constructor(private readonly dependencies: SearchServiceDependencies) {}

  public async search(query: JobSearchQuery): Promise<SearchResponse> {
    try {
      const cached = await this.dependencies.cache.get(query);
      if (cached !== null) return { result: cached, cache: 'HIT' };
    } catch (error) {
      this.dependencies.onCacheError?.(error, 'get');
    }

    const result = await this.dependencies.repository.search(query);
    if (result.total > 0) {
      try {
        await this.dependencies.cache.set(query, result);
      } catch (error) {
        this.dependencies.onCacheError?.(error, 'set');
      }
    }
    return { result, cache: 'MISS' };
  }

  public autocomplete(prefix: string, limit: number): Promise<readonly string[]> {
    return this.dependencies.repository.autocomplete(prefix, limit);
  }
}
