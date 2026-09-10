import type { ReadinessService } from '../services/readiness-service.js';
import type { ApiInstance } from '../types.js';

const healthResponseSchema = {
  type: 'object',
  required: ['status'],
  properties: { status: { type: 'string' } },
} as const;

export function registerHealthRoutes(
  app: ApiInstance,
  readiness: ReadinessService,
): void {
  app.get('/health/live', {
    schema: {
      tags: ['Health'],
      summary: 'Process liveness probe',
      response: { 200: healthResponseSchema },
    },
  }, () => ({ status: 'ok' }));

  app.get('/health/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Infrastructure readiness probe',
    },
  }, async (_request, reply) => {
    const result = await readiness.check();
    return reply.code(result.ready ? 200 : 503).send({
      status: result.ready ? 'ready' : 'not_ready',
      dependencies: result.dependencies,
    });
  });
}
