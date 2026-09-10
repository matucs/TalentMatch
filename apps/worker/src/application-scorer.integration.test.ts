import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import type { Collection } from 'mongodb';
import type { MatchScore } from '@talentmatch/shared';
import { ApplicationScorer } from './application-scorer.js';
import { MongoApplicationScoreStore } from './mongo-application-score-store.js';

const integration = describe.runIf(process.env['RUN_INTEGRATION'] === 'true');
const client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
const databaseName = 'talentmatch_scorer_integration_test';
const eventId = 'score-event-1';
let scorer: ApplicationScorer;
interface TestApplicationDocument {
  readonly _id: string;
  readonly status: string;
  readonly profile: {
    readonly skills: readonly string[]; readonly experienceYears: number; readonly city: string;
    readonly remote: boolean; readonly salaryExpectation: number;
  };
  readonly jobSnapshot: {
    readonly skills: readonly string[]; readonly city: string; readonly remote: boolean;
    readonly salaryMax: number;
  };
  readonly scoreSync: { readonly eventId: string };
  readonly updatedAt: Date;
  readonly score?: MatchScore;
}
let applications: Collection<TestApplicationDocument>;

integration('application scoring persistence', () => {
  beforeAll(async () => {
    await client.connect();
    const database = client.db(databaseName);
    await database.dropDatabase();
    applications = database.collection<TestApplicationDocument>('applications');
    await applications.insertOne({
      _id: 'application-1',
      status: 'scoring',
      profile: {
        skills: ['typescript', 'node.js'], experienceYears: 5, city: 'Graz', remote: true,
        salaryExpectation: 90_000,
      },
      jobSnapshot: {
        skills: ['typescript', 'mongodb', 'node.js'], city: 'Vienna', remote: true,
        salaryMax: 100_000,
      },
      scoreSync: { eventId },
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    scorer = new ApplicationScorer(
      new MongoApplicationScoreStore(database),
      () => new Date('2026-01-02T00:00:00.000Z'),
    );
  });

  afterAll(async () => {
    await client.db(databaseName).dropDatabase();
    await client.close();
  });

  it('persists the deterministic score and is safe to replay', async () => {
    const command = { applicationId: 'application-1', eventId };
    await scorer.process(command);
    await scorer.process(command);

    const application = await applications.findOne({ _id: 'application-1' });
    expect(application).toMatchObject({
      status: 'scored',
      score: {
        score: 80,
        matchedSkills: ['node.js', 'typescript'],
        missingSkills: ['mongodb'],
        breakdown: { skills: 40, experience: 10, location: 20, salary: 10 },
      },
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
  });
});
