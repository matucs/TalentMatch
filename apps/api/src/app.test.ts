import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@talentmatch/logger';
import { buildApp } from './app.js';
import type { ApiInstance } from './types.js';
import { JobService } from './modules/jobs/application/job-service.js';
import type { JobRepository } from './modules/jobs/ports/job-repository.js';
import { SearchService } from './modules/search/application/search-service.js';
import { ApplicationService } from './modules/applications/application/application-service.js';
import type { ApplicationRepository } from './modules/applications/ports/application-repository.js';
import type { StoredApplication } from './modules/applications/domain/application.js';
import { AuthService } from './security/auth-service.js';
import type { RateLimiter } from './security/rate-limiter.js';

const apps: ApiInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

async function createTestApp(
  checks: Parameters<typeof buildApp>[0]['healthChecks'] = [],
  jobService?: JobService,
  searchService?: SearchService,
  applicationService?: ApplicationService,
  authService?: AuthService,
  rateLimiter?: RateLimiter,
): Promise<ApiInstance> {
  const app = await buildApp({
    logger: createLogger({ level: 'silent', service: 'api-test', environment: 'test' }),
    healthChecks: checks,
    ...(jobService === undefined ? {} : { jobService }),
    ...(searchService === undefined ? {} : { searchService }),
    ...(applicationService === undefined ? {} : { applicationService }),
    ...(authService === undefined ? {} : { authService }),
    ...(rateLimiter === undefined ? {} : { rateLimiter }),
  });
  apps.push(app);
  return app;
}

describe('health routes', () => {
  it('returns liveness and propagates a supplied request ID', async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'test-request-id' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('test-request-id');
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 when an infrastructure dependency is down', async () => {
    const app = await createTestApp([
      { name: 'mongodb', check: () => Promise.reject(new Error('offline')) },
    ]);
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'not_ready',
      dependencies: [{ name: 'mongodb', status: 'down' }],
    });
  });

  it('does not leak internals in not-found responses', async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
    expect(response.body).not.toContain('stack');
  });

  it('exports process and HTTP request metrics', async () => {
    const app = await createTestApp();
    await app.inject({ method: 'GET', url: '/health/live' });
    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('talentmatch_http_request_duration_seconds');
    expect(response.body).toContain('route="/health/live"');
  });
});

describe('interactive demo', () => {
  it('serves the guided browser workflow only when enabled', async () => {
    const app = await buildApp({
      logger: createLogger({ level: 'silent', service: 'api-test', environment: 'test' }),
      enableDemo: true,
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/demo' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Run full demo');
    expect(response.body).toContain("'/v1/jobs'");
  });
});

function createJobService(): JobService {
  const repository: JobRepository = {
    create: async (id, input, now) => ({
      id,
      ...input,
      status: 'draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
    }),
    findById: async () => null,
    publishDraft: async () => null,
    softDelete: async () => null,
    markEventDispatched: async () => undefined,
  };
  return new JobService({
    repository,
    indexQueue: { enqueue: async () => undefined },
    newId: () => '00000000-0000-4000-8000-000000000001',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('job routes', () => {
  const validBody = {
    title: 'Backend Engineer',
    description: 'Build dependable backend services.',
    city: 'Vienna',
    remote: true,
    skills: ['TypeScript', 'Node.js'],
    salary: { min: 70_000, max: 90_000, currency: 'eur' },
  };

  it('creates a validated draft and returns its resource location', async () => {
    const app = await createTestApp([], createJobService());
    const response = await app.inject({ method: 'POST', url: '/v1/jobs', payload: validBody });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe('/v1/jobs/00000000-0000-4000-8000-000000000001');
    expect(response.json()).toMatchObject({
      status: 'draft',
      skills: ['node.js', 'typescript'],
      salary: { currency: 'EUR' },
    });
  });

  it('returns the stable validation envelope for cross-field salary errors', async () => {
    const app = await createTestApp([], createJobService());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: { ...validBody, salary: { min: 100_000, max: 90_000, currency: 'EUR' } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
    });
  });
});

describe('search routes', () => {
  it('normalizes filters and exposes cache status', async () => {
    const result = { items: [], total: 0, page: 1, limit: 20, pages: 0 };
    const search = vi.fn(async () => result);
    const searchService = new SearchService({
      repository: { search, autocomplete: async () => [] },
      cache: {
        get: async () => null,
        set: async () => undefined,
        invalidate: async () => undefined,
      },
    });
    const app = await createTestApp([], undefined, searchService);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/jobs/search?city=Vienna&skills=TypeScript,node.js&remote=true',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cache']).toBe('MISS');
    expect(response.json()).toEqual(result);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      city: 'vienna',
      skills: ['node.js', 'typescript'],
      remote: true,
    }));
  });

  it('rejects malformed boolean filters', async () => {
    const searchService = new SearchService({
      repository: {
        search: async () => ({ items: [], total: 0, page: 1, limit: 20, pages: 0 }),
        autocomplete: async () => [],
      },
      cache: { get: async () => null, set: async () => undefined, invalidate: async () => undefined },
    });
    const app = await createTestApp([], undefined, searchService);
    const response = await app.inject({ method: 'GET', url: '/v1/jobs/search?remote=perhaps' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

function createApplicationService(): ApplicationService {
  const now = new Date('2026-01-01T00:00:00.000Z');
  let stored: StoredApplication | undefined;
  const applications: ApplicationRepository = {
    createIdempotent: async (input) => {
      if (stored !== undefined) return { application: stored, replayed: true };
      stored = {
        id: input.id, jobId: input.jobId, candidateId: input.candidateId,
        profile: input.profile, idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint, jobSnapshot: input.jobSnapshot,
        scoreSync: { eventId: input.scoreEventId, pendingSince: input.now },
        status: 'scoring', createdAt: input.now, updatedAt: input.now,
      };
      return { application: stored, replayed: false };
    },
    findById: async () => stored ?? null,
    markScoreEventDispatched: async (_id, eventId, dispatchedAt) => {
      if (stored !== undefined) {
        stored = { ...stored, scoreSync: { ...stored.scoreSync, eventId, dispatchedAt } };
      }
    },
  };
  const publishedJob = {
    id: '00000000-0000-4000-8000-000000000001', employerId: 'employer-1',
    title: 'Backend Engineer', description: 'Build dependable backend services.',
    city: 'Vienna', remote: true, skills: ['typescript'],
    salary: { min: 70_000, max: 100_000, currency: 'EUR' }, status: 'published' as const,
    version: 2, createdAt: now, updatedAt: now, publishedAt: now,
  };
  const jobs: JobRepository = {
    create: async () => publishedJob,
    findById: async () => publishedJob,
    publishDraft: async () => null,
    softDelete: async () => null,
    markEventDispatched: async () => undefined,
  };
  const ids = [
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005',
  ];
  return new ApplicationService({
    applications, jobs, scoreQueue: { enqueue: async () => undefined }, now: () => now,
    newId: () => ids.shift() ?? '00000000-0000-4000-8000-000000000099',
  });
}

describe('application routes', () => {
  const payload = {
    skills: ['TypeScript'], experienceYears: 5,
    city: 'Vienna', remote: true, salaryExpectation: 90_000,
  };

  it('requires an idempotency key', async () => {
    const app = await createTestApp([], undefined, undefined, createApplicationService());
    const response = await app.inject({
      method: 'POST',
      url: '/v1/jobs/00000000-0000-4000-8000-000000000001/applications',
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns the same application for an idempotent replay', async () => {
    const app = await createTestApp([], undefined, undefined, createApplicationService());
    const request = {
      method: 'POST' as const,
      url: '/v1/jobs/00000000-0000-4000-8000-000000000001/applications',
      headers: { 'idempotency-key': 'apply-request-1' },
      payload,
    };
    const first = await app.inject(request);
    const replay = await app.inject(request);

    expect(first.statusCode).toBe(202);
    expect(first.headers['idempotent-replayed']).toBe('false');
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.json()).toEqual(first.json());
  });
});

describe('authenticated routes', () => {
  it('derives employer identity from the verified token instead of request input', async () => {
    const auth = new AuthService({
      enabled: true,
      verifier: {
        verify: async () => ({ subject: 'verified-employer', roles: ['employer'] }),
      },
    });
    const app = await createTestApp([], createJobService(), undefined, undefined, auth);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        title: 'Backend Engineer',
        description: 'Build dependable backend services.',
        city: 'Vienna',
        remote: true,
        skills: ['TypeScript'],
        salary: { min: 70_000, max: 90_000, currency: 'EUR' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ employerId: 'verified-employer' });
  });

  it('returns the public unauthorized envelope when a bearer token is missing', async () => {
    const auth = new AuthService({
      enabled: true,
      verifier: { verify: async () => ({ subject: 'employer', roles: ['employer'] }) },
    });
    const app = await createTestApp([], createJobService(), undefined, undefined, auth);
    const response = await app.inject({ method: 'POST', url: '/v1/jobs', payload: {} });

    expect(response.statusCode).toBe(400);
    // Fastify validates the body before the handler. A valid payload without a token exercises 401.
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/v1/jobs',
      payload: {
        title: 'Backend Engineer', description: 'Build dependable backend services.',
        city: 'Vienna', remote: true, skills: ['TypeScript'],
        salary: { min: 70_000, max: 90_000, currency: 'EUR' },
      },
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });
});

describe('rate limiting', () => {
  it('returns quota headers and the stable 429 envelope', async () => {
    const limiter: RateLimiter = {
      consume: async () => ({ allowed: false, limit: 2, remaining: 0, retryAfterSeconds: 30 }),
    };
    const app = await createTestApp([], undefined, undefined, undefined, undefined, limiter);
    const response = await app.inject({ method: 'GET', url: '/v1/jobs/search' });

    expect(response.statusCode).toBe(429);
    expect(response.headers['x-ratelimit-limit']).toBe('2');
    expect(response.headers['x-ratelimit-remaining']).toBe('0');
    expect(response.headers['retry-after']).toBe('30');
    expect(response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });

  it('excludes health probes from quotas', async () => {
    const limiter: RateLimiter = {
      consume: async () => { throw new Error('Health probe should not consume quota'); },
    };
    const app = await createTestApp([], undefined, undefined, undefined, undefined, limiter);
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
  });
});
