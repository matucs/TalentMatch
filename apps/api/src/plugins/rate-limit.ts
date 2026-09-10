import { createHash } from 'node:crypto';
import type { ErrorResponse } from '@talentmatch/shared';
import type { ApiInstance } from '../types.js';
import type { RateLimiter } from '../security/rate-limiter.js';

const excludedPaths = new Set(['/health/live', '/health/ready', '/metrics']);

export function registerRateLimit(app: ApiInstance, limiter: RateLimiter): void {
  app.addHook('onRequest', async (request, reply) => {
    if (excludedPaths.has(request.url.split('?')[0] ?? request.url)) return;
    let decision;
    try {
      decision = await limiter.consume(actorKey(request.ip, request.headers));
    } catch (error) {
      request.log.warn({ err: error }, 'Rate limiter unavailable; request allowed');
      return;
    }

    void reply.header('x-ratelimit-limit', decision.limit);
    void reply.header('x-ratelimit-remaining', decision.remaining);
    void reply.header('x-ratelimit-reset', decision.retryAfterSeconds);
    if (decision.allowed) return;

    void reply.header('retry-after', decision.retryAfterSeconds);
    const response: ErrorResponse = {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        requestId: request.id,
      },
    };
    return reply.code(429).send(response);
  });
}

function actorKey(ip: string, headers: Record<string, string | string[] | undefined>): string {
  const authorization = headers['authorization'];
  const developmentSubject = headers['x-development-subject'];
  const actor = typeof authorization === 'string'
    ? authorization
    : typeof developmentSubject === 'string' ? developmentSubject : 'anonymous';
  return createHash('sha256').update(`${ip}\0${actor}`).digest('hex');
}
