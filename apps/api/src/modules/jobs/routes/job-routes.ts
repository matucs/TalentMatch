import type { ApiInstance } from '../../../types.js';
import type { JobService } from '../application/job-service.js';
import { createJobSchema, jobIdParamsSchema } from '../validation/job-schemas.js';
import type { AuthService } from '../../../security/auth-service.js';

const jobResponseSchema = {
  type: 'object',
  required: [
    'id', 'employerId', 'title', 'description', 'city', 'remote', 'skills',
    'salary', 'status', 'version', 'createdAt', 'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    employerId: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    city: { type: 'string' },
    remote: { type: 'boolean' },
    skills: { type: 'array', items: { type: 'string' } },
    salary: {
      type: 'object',
      required: ['min', 'max', 'currency'],
      properties: {
        min: { type: 'integer' },
        max: { type: 'integer' },
        currency: { type: 'string' },
      },
    },
    status: { type: 'string', enum: ['draft', 'published'] },
    version: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    publishedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'city', 'remote', 'skills', 'salary'],
  properties: {
    title: { type: 'string', minLength: 3, maxLength: 160 },
    description: { type: 'string', minLength: 20, maxLength: 10_000 },
    city: { type: 'string', minLength: 1, maxLength: 120 },
    remote: { type: 'boolean' },
    skills: {
      type: 'array', minItems: 1, maxItems: 50,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    salary: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max', 'currency'],
      properties: {
        min: { type: 'integer', minimum: 0 },
        max: { type: 'integer', minimum: 1 },
        currency: { type: 'string', pattern: '^[A-Za-z]{3}$' },
      },
    },
  },
} as const;

const jobParamsOpenApiSchema = {
  type: 'object',
  required: ['jobId'],
  properties: { jobId: { type: 'string', format: 'uuid' } },
} as const;

export function registerJobRoutes(app: ApiInstance, service: JobService, auth: AuthService): void {
  app.post('/v1/jobs', {
    schema: {
      tags: ['Jobs'],
      summary: 'Create a draft job',
      security: [{ bearerAuth: [] }],
      body: createBodySchema,
      response: { 201: jobResponseSchema },
    },
  }, async (request, reply) => {
    const identity = await auth.require(request, 'employer');
    const input = createJobSchema.parse(request.body);
    const job = await service.create({ ...input, employerId: identity.subject });
    void reply.header('location', `/v1/jobs/${job.id}`);
    return reply.code(201).send(job);
  });

  app.get('/v1/jobs/:jobId', {
    schema: {
      tags: ['Jobs'],
      summary: 'Get a job',
      params: jobParamsOpenApiSchema,
      response: { 200: jobResponseSchema },
    },
  }, async (request) => {
    const { jobId } = jobIdParamsSchema.parse(request.params);
    return service.get(jobId);
  });

  app.post('/v1/jobs/:jobId/publish', {
    schema: {
      tags: ['Jobs'],
      summary: 'Publish a draft job',
      security: [{ bearerAuth: [] }],
      params: jobParamsOpenApiSchema,
      response: { 200: jobResponseSchema },
    },
  }, async (request) => {
    const identity = await auth.require(request, 'employer');
    const { jobId } = jobIdParamsSchema.parse(request.params);
    return service.publish(jobId, identity.subject);
  });

  app.delete('/v1/jobs/:jobId', {
    schema: {
      tags: ['Jobs'], summary: 'Delete a job', params: jobParamsOpenApiSchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const identity = await auth.require(request, 'employer');
    const { jobId } = jobIdParamsSchema.parse(request.params);
    await service.delete(jobId, identity.subject);
    return reply.code(204).send();
  });
}
