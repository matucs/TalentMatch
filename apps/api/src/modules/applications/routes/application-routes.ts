import type { ApiInstance } from '../../../types.js';
import type { ApplicationService } from '../application/application-service.js';
import {
  applicationIdParamsSchema,
  applySchema,
  idempotencyKeySchema,
} from '../validation/application-schemas.js';
import { jobIdParamsSchema } from '../../jobs/validation/job-schemas.js';
import { AppError } from '@talentmatch/shared';
import type { AuthService } from '../../../security/auth-service.js';

const jobParamsSchema = {
  type: 'object', required: ['jobId'],
  properties: { jobId: { type: 'string', format: 'uuid' } },
} as const;
const applicationParamsSchema = {
  type: 'object', required: ['applicationId'],
  properties: { applicationId: { type: 'string', format: 'uuid' } },
} as const;
const applyBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['skills', 'experienceYears', 'city', 'remote', 'salaryExpectation'],
  properties: {
    skills: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } },
    experienceYears: { type: 'number', minimum: 0, maximum: 80 },
    city: { type: 'string', minLength: 1, maxLength: 120 },
    remote: { type: 'boolean' },
    salaryExpectation: { type: 'integer', minimum: 0 },
  },
} as const;

export function registerApplicationRoutes(
  app: ApiInstance,
  service: ApplicationService,
  auth: AuthService,
): void {
  app.post('/v1/jobs/:jobId/applications', {
    schema: {
      tags: ['Applications'],
      summary: 'Apply to a published job',
      security: [{ bearerAuth: [] }],
      params: jobParamsSchema,
      headers: {
        type: 'object',
        required: ['idempotency-key'],
        properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 128 } },
      },
      body: applyBodySchema,
    },
  }, async (request, reply) => {
    const identity = await auth.require(request, 'candidate');
    const { jobId } = jobIdParamsSchema.parse(request.params);
    const idempotencyKey = idempotencyKeySchema.parse(request.headers['idempotency-key']);
    const input = applySchema.parse(request.body);
    const result = await service.apply(jobId, idempotencyKey, identity.subject, input);
    void reply.header('location', `/v1/applications/${result.application.id}`);
    void reply.header('idempotent-replayed', String(result.replayed));
    return reply.code(result.replayed ? 200 : 202).send(result.application);
  });

  app.get('/v1/applications/:applicationId', {
    schema: {
      tags: ['Applications'],
      summary: 'Get application and scoring result',
      security: [{ bearerAuth: [] }],
      params: applicationParamsSchema,
    },
  }, async (request) => {
    const identity = await auth.require(request, 'candidate');
    const { applicationId } = applicationIdParamsSchema.parse(request.params);
    const application = await service.get(applicationId);
    if (application.candidateId !== identity.subject) {
      throw new AppError('FORBIDDEN', 'Candidate does not own this application', 403);
    }
    return application;
  });
}
