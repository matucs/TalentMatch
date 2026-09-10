import type { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { Redis } from 'ioredis';
import { MongoClient, type Db } from 'mongodb';
import type { Logger } from '@talentmatch/logger';
import type { AppConfig } from '@talentmatch/config';
import type { HealthCheck } from '../types.js';
import { createOpenSearchClient } from './opensearch-client.js';

export interface RuntimeDependencies {
  readonly checks: readonly HealthCheck[];
  readonly cacheRedis: Redis;
  readonly database: Db;
  readonly search: OpenSearchClient;
  close(): Promise<void>;
}

export async function connectDependencies(
  config: AppConfig,
  logger: Logger,
): Promise<RuntimeDependencies> {
  const mongo = new MongoClient(config.MONGODB_URI, {
    connectTimeoutMS: config.DEPENDENCY_TIMEOUT_MS,
    serverSelectionTimeoutMS: config.DEPENDENCY_TIMEOUT_MS,
  });
  const redis = new Redis(config.REDIS_URL, {
    connectTimeout: config.DEPENDENCY_TIMEOUT_MS,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const search = createOpenSearchClient(
    config.OPENSEARCH_NODE,
    config.DEPENDENCY_TIMEOUT_MS,
    config.OPENSEARCH_AWS_REGION,
  );

  try {
    await Promise.all([mongo.connect(), redis.connect(), search.ping()]);
  } catch (error) {
    await Promise.allSettled([mongo.close(), redis.quit(), search.close()]);
    throw error;
  }

  logger.info('Infrastructure connections established');

  return {
    cacheRedis: redis,
    database: mongo.db(),
    search,
    checks: [
      { name: 'mongodb', check: async () => void (await mongo.db().command({ ping: 1 })) },
      { name: 'redis', check: async () => void (await redis.ping()) },
      { name: 'opensearch', check: async () => void (await search.ping()) },
    ],
    close: async () => {
      await Promise.allSettled([mongo.close(), redis.quit(), search.close()]);
    },
  };
}
