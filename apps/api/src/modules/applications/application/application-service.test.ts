import { describe, expect, it, vi } from 'vitest';
import type { Job } from '../../jobs/domain/job.js';
import type { JobRepository } from '../../jobs/ports/job-repository.js';
import type { StoredApplication } from '../domain/application.js';
import type { ApplicationRepository } from '../ports/application-repository.js';
import { ApplicationService } from './application-service.js';

const now = new Date('2026-01-01T00:00:00.000Z');
const job: Job = {
  id: '00000000-0000-4000-8000-000000000001', employerId: 'employer-1',
  title: 'Backend Engineer', description: 'Build dependable backend services.',
  city: 'Vienna', remote: true, skills: ['typescript', 'mongodb'],
  salary: { min: 70_000, max: 100_000, currency: 'EUR' }, status: 'published',
  version: 2, createdAt: now, updatedAt: now, publishedAt: now,
};

function jobRepository(): JobRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(async () => job),
    publishDraft: vi.fn(),
    softDelete: vi.fn(),
    markEventDispatched: vi.fn(),
  };
}

describe('ApplicationService', () => {
  it('normalizes input, creates an atomic score marker, and enqueues it', async () => {
    const markScoreEventDispatched = vi.fn(async () => undefined);
    const createIdempotent: ApplicationRepository['createIdempotent'] = async (input) => ({
      replayed: false,
      application: {
        id: input.id, jobId: input.jobId, candidateId: input.candidateId,
        profile: input.profile, idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint, jobSnapshot: input.jobSnapshot,
        scoreSync: { eventId: input.scoreEventId, pendingSince: input.now },
        status: 'scoring', createdAt: input.now, updatedAt: input.now,
      },
    });
    const applications: ApplicationRepository = {
      createIdempotent: vi.fn(createIdempotent),
      findById: vi.fn(async () => null),
      markScoreEventDispatched,
    };
    const enqueue = vi.fn(async () => undefined);
    const ids = [
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ];
    const service = new ApplicationService({
      applications, jobs: jobRepository(), scoreQueue: { enqueue }, now: () => now,
      newId: () => ids.shift() ?? 'unexpected',
    });

    const result = await service.apply(job.id, 'request-1', 'candidate-1', {
      skills: ['TypeScript', ' typescript ', 'MongoDB'],
      experienceYears: 5, city: ' Vienna ', remote: true, salaryExpectation: 90_000,
    });

    expect(result.application.profile.skills).toEqual(['mongodb', 'typescript']);
    expect(enqueue).toHaveBeenCalledWith({
      eventId: '00000000-0000-4000-8000-000000000002',
      applicationId: '00000000-0000-4000-8000-000000000003',
    });
    expect(markScoreEventDispatched).toHaveBeenCalledOnce();
  });

  it('retries delivery on an idempotent replay while its marker remains pending', async () => {
    const stored: StoredApplication = {
      id: '00000000-0000-4000-8000-000000000003', jobId: job.id,
      candidateId: 'candidate-1', profile: {
        skills: ['typescript'], experienceYears: 3, city: 'Vienna', remote: true,
        salaryExpectation: 90_000,
      }, idempotencyKey: 'request-1', requestFingerprint: 'fingerprint',
      jobSnapshot: { skills: job.skills, city: job.city, remote: job.remote, salaryMax: job.salary.max },
      scoreSync: { eventId: '00000000-0000-4000-8000-000000000002', pendingSince: now },
      status: 'scoring', createdAt: now, updatedAt: now,
    };
    const applications: ApplicationRepository = {
      createIdempotent: vi.fn(async () => ({ application: stored, replayed: true })),
      findById: vi.fn(async () => stored),
      markScoreEventDispatched: vi.fn(async () => undefined),
    };
    const enqueue = vi.fn(async () => undefined);
    const service = new ApplicationService({
      applications, jobs: jobRepository(), scoreQueue: { enqueue },
    });

    await service.apply(job.id, 'request-1', 'candidate-1', {
      skills: ['typescript'], experienceYears: 3,
      city: 'Vienna', remote: true, salaryExpectation: 90_000,
    });
    expect(enqueue).toHaveBeenCalledWith({
      eventId: stored.scoreSync.eventId, applicationId: stored.id,
    });
  });
});
