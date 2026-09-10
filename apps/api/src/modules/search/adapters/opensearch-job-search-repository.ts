import type { API, Client } from '@opensearch-project/opensearch';
import { createJobSearchIndexDefinition, JOB_SEARCH_INDEX } from '@talentmatch/shared';
import type { JobSearchQuery, JobSearchResult, SearchSort } from '../domain/search.js';
import type { JobSearchRepository } from '../ports/job-search-repository.js';
import { jobSearchDocumentSchema } from '../validation/search-schemas.js';

export class OpenSearchJobSearchRepository implements JobSearchRepository {
  public constructor(private readonly client: Client) {}

  public async ensureIndexExists(): Promise<void> {
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

  public async search(query: JobSearchQuery): Promise<JobSearchResult> {
    const response = await this.client.search({
      index: JOB_SEARCH_INDEX,
      body: {
        from: (query.page - 1) * query.limit,
        size: query.limit,
        track_total_hits: true,
        query: buildQuery(query),
        sort: buildSort(query.sort),
      },
    });

    const items = response.body.hits.hits.flatMap((hit) => {
      const parsed = jobSearchDocumentSchema.safeParse(hit._source);
      return parsed.success ? [parsed.data] : [];
    });
    const total = totalHits(response.body.hits.total);
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      pages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  }

  public async autocomplete(prefix: string, limit: number): Promise<readonly string[]> {
    const response = await this.client.search({
      index: JOB_SEARCH_INDEX,
      body: {
        size: limit,
        _source: ['title'],
        query: {
          multi_match: {
            query: prefix,
            type: 'bool_prefix',
            fields: ['title.autocomplete', 'title.autocomplete._2gram', 'title.autocomplete._3gram'],
          },
        },
        collapse: { field: 'title.raw' },
      },
    });

    const titles = response.body.hits.hits.flatMap((hit) => {
      const source = hit._source;
      if (typeof source !== 'object' || source === null || !('title' in source)) return [];
      return typeof source['title'] === 'string' ? [source['title']] : [];
    });
    return [...new Set(titles)];
  }
}

function buildQuery(query: JobSearchQuery): Record<string, unknown> {
  const must: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [];

  if (query.keyword !== undefined) {
    must.push({
      multi_match: {
        query: query.keyword,
        fields: ['title^4', 'description', 'city^2', 'skills^3'],
        fuzziness: 'AUTO',
        prefix_length: 1,
      },
    });
  }
  if (query.city !== undefined) filter.push({ term: { 'city.raw': query.city } });
  if (query.remote !== undefined) filter.push({ term: { remote: query.remote } });
  for (const skill of query.skills) filter.push({ term: { skills: skill } });
  if (query.salaryMin !== undefined) filter.push({ range: { 'salary.max': { gte: query.salaryMin } } });
  if (query.salaryMax !== undefined) filter.push({ range: { 'salary.min': { lte: query.salaryMax } } });

  return {
    bool: {
      must: must.length === 0 ? [{ match_all: {} }] : must,
      filter,
    },
  };
}

function buildSort(sort: SearchSort): NonNullable<API.Search_RequestBody['sort']> {
  switch (sort) {
    case 'newest': return [{ publishedAt: { order: 'desc' } }, { _id: { order: 'asc' } }];
    case 'salary_asc': return [{ 'salary.min': { order: 'asc' } }, { _id: { order: 'asc' } }];
    case 'salary_desc': return [{ 'salary.max': { order: 'desc' } }, { _id: { order: 'asc' } }];
    case 'relevance': return [{ _score: { order: 'desc' } }, { publishedAt: { order: 'desc' } }];
  }
}

function totalHits(total: number | { readonly value: number } | undefined): number {
  if (total === undefined) return 0;
  return typeof total === 'number' ? total : total.value;
}
