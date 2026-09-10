import { describe, expect, it, vi } from 'vitest';
import type { Job, JobMutation } from '../domain/job.js';
import type { JobRepository } from '../ports/job-repository.js';
import type { IndexCommandQueue } from '../ports/index-command-queue.js';
import { JobService } from './job-service.js';

const now = new Date('2026-01-01T00:00:00.000Z');
const job: Job = {
  id: '00000000-0000-4000-8000-000000000001',
  employerId: 'employer-1',
  title: 'Backend Engineer',
  description: 'Build dependable backend services.',
  city: 'Vienna',
  remote: true,
  skills: ['node.js', 'typescript'],
  salary: { min: 70_000, max: 90_000, currency: 'EUR' },
  status: 'draft',
  version: 1,
  createdAt: now,
  updatedAt: now,
};

function createDependencies(overrides: Partial<JobRepository> = {}): {
  repository: JobRepository;
  indexQueue: IndexCommandQueue;
} {
  return {
    repository: {
      create: vi.fn(async (_id, input) => ({ ...job, ...input })),
      findById: vi.fn(async () => job),
      publishDraft: vi.fn(async () => null),
      softDelete: vi.fn(async () => null),
      markEventDispatched: vi.fn(async () => undefined),
      ...overrides,
    },
    indexQueue: { enqueue: vi.fn(async () => undefined) },
  };
}

describe('JobService', () => {
  it('normalizes skills and currency before persistence', async () => {
    const dependencies = createDependencies();
    const service = new JobService({ ...dependencies, now: () => now, newId: () => job.id });

    await service.create({
      employerId: 'employer-1',
      title: ' Backend Engineer ',
      description: ' Build dependable backend services. ',
      city: ' Vienna ',
      remote: true,
      skills: ['TypeScript', ' node.js ', 'typescript'],
      salary: { min: 70_000, max: 90_000, currency: 'eur' },
    });

    expect(dependencies.repository.create).toHaveBeenCalledWith(job.id, expect.objectContaining({
      skills: ['node.js', 'typescript'],
      salary: { min: 70_000, max: 90_000, currency: 'EUR' },
    }), now);
  });

  it('marks a publish event dispatched after deterministic queue delivery', async () => {
    const event = {
      eventId: '00000000-0000-4000-8000-000000000002',
      operation: 'upsert' as const,
      pendingSince: now,
    };
    const mutation: JobMutation = {
      job: { ...job, status: 'published', publishedAt: now, indexSync: event },
      event,
    };
    const dependencies = createDependencies({ publishDraft: vi.fn(async () => mutation) });
    const service = new JobService({ ...dependencies, now: () => now, newId: () => event.eventId });

    await expect(service.publish(job.id, job.employerId)).resolves.toMatchObject({ status: 'published' });
    expect(dependencies.indexQueue.enqueue).toHaveBeenCalledWith({
      eventId: event.eventId,
      jobId: job.id,
      operation: 'upsert',
    });
    expect(dependencies.repository.markEventDispatched).toHaveBeenCalledWith(
      job.id,
      event.eventId,
      now,
    );
  });

  it('leaves the outbox event pending when Redis delivery fails', async () => {
    const event = {
      eventId: '00000000-0000-4000-8000-000000000002',
      operation: 'upsert' as const,
      pendingSince: now,
    };
    const mutation: JobMutation = {
      job: { ...job, status: 'published', publishedAt: now, indexSync: event },
      event,
    };
    const dependencies = createDependencies({ publishDraft: vi.fn(async () => mutation) });
    dependencies.indexQueue.enqueue = vi.fn(async () => { throw new Error('Redis offline'); });
    const deferred = vi.fn();
    const service = new JobService({ ...dependencies, onDeliveryDeferred: deferred });

    await expect(service.publish(job.id, job.employerId)).resolves.toMatchObject({ status: 'published' });
    expect(dependencies.repository.markEventDispatched).not.toHaveBeenCalled();
    expect(deferred).toHaveBeenCalledOnce();
  });
});
