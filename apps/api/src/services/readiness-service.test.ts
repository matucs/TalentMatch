import { describe, expect, it } from 'vitest';
import { ReadinessService } from './readiness-service.js';

describe('ReadinessService', () => {
  it('reports ready when every dependency responds', async () => {
    const service = new ReadinessService([
      { name: 'mongodb', check: () => Promise.resolve() },
      { name: 'redis', check: () => Promise.resolve() },
    ], 20);

    await expect(service.check()).resolves.toEqual({
      ready: true,
      dependencies: [
        { name: 'mongodb', status: 'up' },
        { name: 'redis', status: 'up' },
      ],
    });
  });

  it('reports a timed-out dependency without rejecting the whole probe', async () => {
    const service = new ReadinessService([
      { name: 'opensearch', check: () => new Promise(() => undefined) },
    ], 5);

    await expect(service.check()).resolves.toEqual({
      ready: false,
      dependencies: [{ name: 'opensearch', status: 'down' }],
    });
  });
});
