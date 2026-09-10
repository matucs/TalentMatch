import { loadConfig } from '@talentmatch/config';
import { createLogger } from '@talentmatch/logger';
import { buildApp } from './app.js';
import { connectDependencies } from './adapters/dependencies.js';
import { MongoJobRepository } from './modules/jobs/adapters/mongo-job-repository.js';
import { BullMqIndexCommandQueue } from './modules/jobs/adapters/bullmq-index-command-queue.js';
import { JobService } from './modules/jobs/application/job-service.js';
import { OpenSearchJobSearchRepository } from './modules/search/adapters/opensearch-job-search-repository.js';
import { RedisSearchCache } from './modules/search/adapters/redis-search-cache.js';
import { SearchService } from './modules/search/application/search-service.js';
import { MongoApplicationRepository } from './modules/applications/adapters/mongo-application-repository.js';
import { BullMqScoreCommandQueue } from './modules/applications/adapters/bullmq-score-command-queue.js';
import { ApplicationService } from './modules/applications/application/application-service.js';
import { AuthService, createOidcVerifier } from './security/auth-service.js';
import { RedisRateLimiter } from './adapters/redis-rate-limiter.js';

const config = loadConfig();
const logger = createLogger({
  level: config.LOG_LEVEL,
  service: 'talentmatch-api',
  environment: config.NODE_ENV,
});

const dependencies = await connectDependencies(config, logger);
const jobRepository = new MongoJobRepository(dependencies.database);
await jobRepository.ensureIndexes();
const indexQueue = new BullMqIndexCommandQueue(config.REDIS_URL);
const searchCache = new RedisSearchCache(dependencies.cacheRedis, config.SEARCH_CACHE_TTL_SECONDS);
const jobService = new JobService({
  repository: jobRepository,
  indexQueue,
  onDeliveryDeferred: (error, command) => {
    logger.warn({ err: error, command }, 'Index command delivery deferred to outbox relay');
  },
  invalidateSearch: async () => searchCache.invalidate(),
  onInvalidationDeferred: (error) => {
    logger.warn({ err: error }, 'Search cache invalidation deferred to index processor');
  },
});
const searchRepository = new OpenSearchJobSearchRepository(dependencies.search);
await searchRepository.ensureIndexExists();
const searchService = new SearchService({
  repository: searchRepository,
  cache: searchCache,
  onCacheError: (error, operation) => {
    logger.warn({ err: error, operation }, 'Search cache operation failed; continuing without cache');
  },
});
const applicationRepository = new MongoApplicationRepository(dependencies.database);
await applicationRepository.ensureIndexes();
const scoreQueue = new BullMqScoreCommandQueue(config.REDIS_URL);
const applicationService = new ApplicationService({
  applications: applicationRepository,
  jobs: jobRepository,
  scoreQueue,
  onDeliveryDeferred: (error, command) => {
    logger.warn({ err: error, command }, 'Score command delivery deferred to outbox relay');
  },
});
let authService: AuthService;
if (config.AUTH_ENABLED) {
  const { OIDC_ISSUER_URL: issuer, OIDC_AUDIENCE: audience, OIDC_JWKS_URL: jwksUrl } = config;
  if (issuer === undefined || audience === undefined || jwksUrl === undefined) {
    throw new Error('OIDC configuration was not validated');
  }
  authService = new AuthService({
    enabled: true,
    verifier: createOidcVerifier(issuer, audience, jwksUrl),
  });
} else {
  authService = new AuthService({ enabled: false });
}
const app = await buildApp({
  logger,
  healthChecks: dependencies.checks,
  dependencyTimeoutMs: config.DEPENDENCY_TIMEOUT_MS,
  jobService,
  searchService,
  applicationService,
  requestTimeoutMs: config.REQUEST_TIMEOUT_MS,
  bodyLimitBytes: config.BODY_LIMIT_BYTES,
  enableSwagger: config.ENABLE_SWAGGER,
  enableDemo: config.ENABLE_DEMO && !config.AUTH_ENABLED,
  trustProxy: config.TRUST_PROXY,
  authService,
  rateLimiter: new RedisRateLimiter(
    dependencies.cacheRedis,
    config.RATE_LIMIT_MAX,
    config.RATE_LIMIT_WINDOW_SECONDS,
  ),
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  const forceExit = setTimeout(() => {
    logger.fatal('Graceful shutdown timed out');
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await app.close();
    await indexQueue.close();
    await scoreQueue.close();
    await dependencies.close();
    clearTimeout(forceExit);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Graceful shutdown failed');
    process.exit(1);
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  logger.fatal({ err: error }, 'API failed to start');
  await indexQueue.close();
  await scoreQueue.close();
  await dependencies.close();
  process.exit(1);
}
