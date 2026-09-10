import { randomUUID } from 'node:crypto';
import { loadConfig } from '@talentmatch/config';
import { createLogger } from '@talentmatch/logger';
import { JOB_SEARCH_INDEX } from '@talentmatch/shared';
import { MongoClient } from 'mongodb';
import { BullMqCommandQueue } from '../bullmq-command-queue.js';
import { OpenSearchJobIndex } from '../opensearch-job-index.js';
import { createOpenSearchClient } from '../opensearch-client.js';

const config = loadConfig();
const logger = createLogger({
  level: config.LOG_LEVEL,
  service: 'talentmatch-reindex',
  environment: config.NODE_ENV,
});
const mongo = new MongoClient(config.MONGODB_URI);
const search = createOpenSearchClient(
  config.OPENSEARCH_NODE,
  config.DEPENDENCY_TIMEOUT_MS,
  config.OPENSEARCH_AWS_REGION,
);
const queue = new BullMqCommandQueue(config.REDIS_URL);

try {
  await mongo.connect();
  const index = new OpenSearchJobIndex(search);
  await search.indices.delete({ index: JOB_SEARCH_INDEX, ignore_unavailable: true });
  await index.ensureExists();

  const cursor = mongo.db().collection<{ _id: string }>('jobs').find(
    { status: 'published' },
    { projection: { _id: 1 } },
  );
  let enqueued = 0;
  for await (const job of cursor) {
    await queue.enqueue({ eventId: randomUUID(), jobId: job._id, operation: 'upsert' });
    enqueued += 1;
  }
  logger.info({ enqueued }, 'Reindex commands enqueued');
} catch (error) {
  logger.fatal({ err: error }, 'Reindex failed');
  process.exitCode = 1;
} finally {
  await queue.close();
  await Promise.allSettled([mongo.close(), search.close()]);
}
