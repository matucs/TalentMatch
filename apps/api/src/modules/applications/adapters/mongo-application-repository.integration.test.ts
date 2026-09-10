import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoApplicationRepository } from './mongo-application-repository.js';

const integration = describe.runIf(process.env['RUN_INTEGRATION'] === 'true');
const client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
const databaseName = 'talentmatch_applications_integration_test';
let repository: MongoApplicationRepository;
const now = new Date('2026-01-01T00:00:00.000Z');

integration('MongoApplicationRepository idempotency', () => {
  beforeAll(async () => {
    await client.connect();
    const database = client.db(databaseName);
    await database.dropDatabase();
    repository = new MongoApplicationRepository(database);
    await repository.ensureIndexes();
  });

  afterAll(async () => {
    await client.db(databaseName).dropDatabase();
    await client.close();
  });

  it('returns the original record for an identical key and rejects key reuse with new input', async () => {
    const input = {
      id: 'application-1', jobId: 'job-1', candidateId: 'candidate-1',
      profile: {
        skills: ['typescript'], experienceYears: 4, city: 'Vienna', remote: true,
        salaryExpectation: 90_000,
      },
      idempotencyKey: 'request-1', requestFingerprint: 'fingerprint-1',
      jobSnapshot: { skills: ['typescript'], city: 'Vienna', remote: true, salaryMax: 100_000 },
      scoreEventId: 'event-1', now,
    };
    await expect(repository.createIdempotent(input)).resolves.toMatchObject({ replayed: false });
    await expect(repository.createIdempotent({
      ...input, id: 'application-2', scoreEventId: 'event-2',
    })).resolves.toMatchObject({
      replayed: true,
      application: { id: 'application-1', scoreSync: { eventId: 'event-1' } },
    });
    await expect(repository.createIdempotent({
      ...input, id: 'application-3', requestFingerprint: 'different',
    })).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });

  it('prevents a second application to the same job under a new key', async () => {
    await expect(repository.createIdempotent({
      id: 'application-4', jobId: 'job-1', candidateId: 'candidate-1',
      profile: {
        skills: ['typescript'], experienceYears: 4, city: 'Vienna', remote: true,
        salaryExpectation: 90_000,
      }, idempotencyKey: 'request-2', requestFingerprint: 'fingerprint-2',
      jobSnapshot: { skills: ['typescript'], city: 'Vienna', remote: true, salaryMax: 100_000 },
      scoreEventId: 'event-4', now,
    })).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });
});
