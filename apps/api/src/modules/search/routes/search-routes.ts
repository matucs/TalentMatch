import type { ApiInstance } from '../../../types.js';
import type { SearchService } from '../application/search-service.js';
import { autocompleteQuerySchema, jobSearchQuerySchema } from '../validation/search-schemas.js';

const searchQueryOpenApiSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keyword: { type: 'string', minLength: 1, maxLength: 200 },
    city: { type: 'string', minLength: 1, maxLength: 120 },
    remote: { type: 'boolean' },
    skills: {
      anyOf: [
        { type: 'string' },
        { type: 'array', items: { type: 'string' } },
      ],
    },
    salaryMin: { type: 'integer', minimum: 0 },
    salaryMax: { type: 'integer', minimum: 1 },
    page: { type: 'integer', minimum: 1, maximum: 1_000, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    sort: {
      type: 'string',
      enum: ['relevance', 'newest', 'salary_asc', 'salary_desc'],
      default: 'relevance',
    },
  },
} as const;

const autocompleteOpenApiSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['prefix'],
  properties: {
    prefix: { type: 'string', minLength: 2, maxLength: 100 },
    limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
  },
} as const;

export function registerSearchRoutes(app: ApiInstance, service: SearchService): void {
  app.get('/v1/jobs/search', {
    schema: {
      tags: ['Search'],
      summary: 'Search published jobs',
      querystring: searchQueryOpenApiSchema,
    },
  }, async (request, reply) => {
    const query = jobSearchQuerySchema.parse(request.query);
    const response = await service.search(query);
    void reply.header('x-cache', response.cache);
    return response.result;
  });

  app.get('/v1/jobs/autocomplete', {
    schema: {
      tags: ['Search'],
      summary: 'Autocomplete job titles',
      querystring: autocompleteOpenApiSchema,
    },
  }, async (request) => {
    const { prefix, limit } = autocompleteQuerySchema.parse(request.query);
    return { suggestions: await service.autocomplete(prefix, limit) };
  });
}
