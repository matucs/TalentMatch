import { randomUUID } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Logger } from '@talentmatch/logger';
import { requestIdSchema } from '@talentmatch/validation';
import type { ApiInstance, HealthCheck } from './types.js';
import { ReadinessService } from './services/readiness-service.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerHealthRoutes } from './routes/health.js';
import type { JobService } from './modules/jobs/application/job-service.js';
import { registerJobRoutes } from './modules/jobs/routes/job-routes.js';
import type { SearchService } from './modules/search/application/search-service.js';
import { registerSearchRoutes } from './modules/search/routes/search-routes.js';
import type { ApplicationService } from './modules/applications/application/application-service.js';
import { registerApplicationRoutes } from './modules/applications/routes/application-routes.js';
import { createMetrics, registerMetricsRoute } from './plugins/metrics.js';
import { AuthService } from './security/auth-service.js';
import type { RateLimiter } from './security/rate-limiter.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerDemoRoute } from './routes/demo.js';

export interface BuildAppOptions {
  readonly logger: Logger;
  readonly healthChecks?: readonly HealthCheck[];
  readonly dependencyTimeoutMs?: number;
  readonly jobService?: JobService;
  readonly searchService?: SearchService;
  readonly applicationService?: ApplicationService;
  readonly requestTimeoutMs?: number;
  readonly bodyLimitBytes?: number;
  readonly enableSwagger?: boolean;
  readonly enableDemo?: boolean;
  readonly trustProxy?: boolean;
  readonly authService?: AuthService;
  readonly rateLimiter?: RateLimiter;
}

export async function buildApp(options: BuildAppOptions): Promise<ApiInstance> {
  const app = Fastify({
    loggerInstance: options.logger,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: (request) => {
      const supplied = requestIdSchema.safeParse(request.headers['x-request-id']);
      return supplied.success ? supplied.data : randomUUID();
    },
    requestTimeout: options.requestTimeoutMs ?? 15_000,
    bodyLimit: options.bodyLimitBytes ?? 1_048_576,
    trustProxy: options.trustProxy ?? false,
  });

  if (options.enableSwagger ?? true) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'TalentMatch API',
          description: 'Employer jobs and candidate applications API',
          version: '0.1.0',
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  const metrics = createMetrics();
  const auth = options.authService ?? new AuthService({ enabled: false });
  registerMetricsRoute(app, metrics);
  if (options.rateLimiter !== undefined) registerRateLimit(app, options.rateLimiter);

  app.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    metrics.requestDuration.observe({
      method: request.method,
      route: request.routeOptions.url ?? 'unmatched',
      status_code: String(reply.statusCode),
    }, reply.elapsedTime / 1_000);
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        duration: reply.elapsedTime,
        statusCode: reply.statusCode,
      },
      'Request completed',
    );
  });

  registerErrorHandler(app);
  const readiness = new ReadinessService(
    options.healthChecks ?? [],
    options.dependencyTimeoutMs ?? 2_000,
  );
  registerHealthRoutes(app, readiness);
  if (options.enableDemo ?? false) registerDemoRoute(app);
  if (options.jobService !== undefined) registerJobRoutes(app, options.jobService, auth);
  if (options.searchService !== undefined) registerSearchRoutes(app, options.searchService);
  if (options.applicationService !== undefined) {
    registerApplicationRoutes(app, options.applicationService, auth);
  }
  return app;
}
