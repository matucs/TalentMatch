import { describe, expect, it, vi } from 'vitest';
import type { JobIndexCommand } from '@talentmatch/shared';
import { OutboxRelay } from './outbox-relay.js';

describe('OutboxRelay', () => {
  it('enqueues pending events then acknowledges their exact event IDs', async () => {
    const command: JobIndexCommand = {
      eventId: 'event-1', jobId: 'job-1', operation: 'upsert',
    };
    const store = {
      findPending: vi.fn(async () => [command]),
      markDispatched: vi.fn(async () => undefined),
    };
    const queue = { enqueue: vi.fn(async () => undefined) };
    const observer = { delivered: vi.fn(), failed: vi.fn() };
    const dispatchedAt = new Date('2026-01-01T00:00:00.000Z');
    const relay = new OutboxRelay(store, queue, observer, () => dispatchedAt);

    await expect(relay.runOnce(100)).resolves.toBe(1);
    expect(queue.enqueue).toHaveBeenCalledWith(command);
    expect(store.markDispatched).toHaveBeenCalledWith(command, dispatchedAt);
    expect(observer.delivered).toHaveBeenCalledOnce();
  });

  it('does not acknowledge an event when queue delivery fails', async () => {
    const command: JobIndexCommand = {
      eventId: 'event-1', jobId: 'job-1', operation: 'delete',
    };
    const store = {
      findPending: vi.fn(async () => [command]),
      markDispatched: vi.fn(async () => undefined),
    };
    const error = new Error('Redis offline');
    const queue = { enqueue: vi.fn(async () => { throw error; }) };
    const observer = { delivered: vi.fn(), failed: vi.fn() };
    const relay = new OutboxRelay(store, queue, observer);

    await expect(relay.runOnce(100)).resolves.toBe(1);
    expect(store.markDispatched).not.toHaveBeenCalled();
    expect(observer.failed).toHaveBeenCalledWith(command, error, expect.any(Number));
  });
});
