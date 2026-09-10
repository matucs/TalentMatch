import type { HealthCheck, ReadinessResult } from '../types.js';

export class ReadinessService {
  public constructor(
    private readonly checks: readonly HealthCheck[],
    private readonly timeoutMs: number,
  ) {}

  public async check(): Promise<ReadinessResult> {
    const dependencies = await Promise.all(
      this.checks.map(async (dependency) => {
        try {
          await withTimeout(dependency.check(), this.timeoutMs);
          return { name: dependency.name, status: 'up' as const };
        } catch {
          return { name: dependency.name, status: 'down' as const };
        }
      }),
    );

    return {
      ready: dependencies.every(({ status }) => status === 'up'),
      dependencies,
    };
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Dependency check timed out')), timeoutMs);
    timeout.unref();
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
