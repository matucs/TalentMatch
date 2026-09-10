import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoJobRepository } from './mongo-job-repository.js';

const integration = describe.runIf(process.env['RUN_INTEGRATION'] === 'true');
const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
const databaseName = 'talentmatch_jobs_integration_test';
const client = new MongoClient(mongoUri);
let repository: MongoJobRepository;

integration('MongoJobRepository', () => {
  beforeAll(async () => {
    await client.connect();
    const database = client.db(databaseName);
    await database.dropDatabase();
    repository = new MongoJobRepository(database);
    await repository.ensureIndexes();
  });

  afterAll(async () => {
    await client.db(databaseName).dropDatabase();
    await client.close();
  });

  it('persists guarded lifecycle transitions and its outbox marker atomically', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const job = await repository.create('job-1', {
      employerId: 'employer-1',
      title: 'Backend Engineer',
      description: 'Build dependable backend services.',
      city: 'Vienna',
      remote: true,
      skills: ['typescript'],
      salary: { min: 70_000, max: 90_000, currency: 'EUR' },
    }, createdAt);

    expect(job).toMatchObject({ status: 'draft', version: 1 });

    const publishedAt = new Date('2026-01-02T00:00:00.000Z');
    const published = await repository.publishDraft('job-1', 'event-publish', publishedAt);
    expect(published).toMatchObject({
      job: { status: 'published', version: 2 },
      event: { eventId: 'event-publish', operation: 'upsert' },
    });
    await expect(repository.publishDraft('job-1', 'duplicate', publishedAt)).resolves.toBeNull();

    await repository.markEventDispatched('job-1', 'event-publish', publishedAt);
    const deleted = await repository.softDelete(
      'job-1',
      'event-delete',
      new Date('2026-01-03T00:00:00.000Z'),
    );
    expect(deleted).toMatchObject({
      job: { status: 'deleted', version: 3 },
      event: { eventId: 'event-delete', operation: 'delete' },
    });
    await expect(repository.findById('job-1')).resolves.toBeNull();
  });
});
