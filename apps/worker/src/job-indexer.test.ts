import { describe, expect, it, vi } from 'vitest';
import type { JobIndexCommand, JobSearchDocument } from '@talentmatch/shared';
import { JobIndexer } from './job-indexer.js';

const command: JobIndexCommand = { eventId: 'event-1', jobId: 'job-1', operation: 'upsert' };
const document: JobSearchDocument = {
  id: 'job-1', employerId: 'employer-1', title: 'Backend Engineer',
  description: 'Build services', city: 'Vienna', remote: true, skills: ['typescript'],
  salary: { min: 70_000, max: 90_000, currency: 'EUR' },
  publishedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('JobIndexer', () => {
  it('loads canonical MongoDB state before upserting and invalidates afterward', async () => {
    const source = { findPublished: vi.fn(async () => document) };
    const index = { upsert: vi.fn(async () => undefined), delete: vi.fn(async () => undefined) };
    const cache = { invalidate: vi.fn(async () => undefined) };

    await new JobIndexer(source, index, cache).process(command);

    expect(index.upsert).toHaveBeenCalledWith(document);
    expect(cache.invalidate).toHaveBeenCalledOnce();
  });

  it('converges stale upsert commands to deletion when MongoDB is no longer published', async () => {
    const source = { findPublished: vi.fn(async () => null) };
    const index = { upsert: vi.fn(async () => undefined), delete: vi.fn(async () => undefined) };
    const cache = { invalidate: vi.fn(async () => undefined) };

    await new JobIndexer(source, index, cache).process(command);

    expect(index.upsert).not.toHaveBeenCalled();
    expect(index.delete).toHaveBeenCalledWith('job-1');
  });
});
