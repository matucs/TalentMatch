import type { Redis } from 'ioredis';
import type { RateLimitDecision, RateLimiter } from '../security/rate-limiter.js';

const consumeScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

export class RedisRateLimiter implements RateLimiter {
  public constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly windowSeconds: number,
  ) {}

  public async consume(key: string): Promise<RateLimitDecision> {
    const rawResult: unknown = await this.redis.eval(
      consumeScript,
      1,
      `rate-limit:${key}`,
      String(this.windowSeconds),
    );
    if (!Array.isArray(rawResult) || rawResult.length !== 2) {
      throw new Error('Redis returned an invalid rate-limit result');
    }
    const count = Number(rawResult[0]);
    const ttl = Math.max(1, Number(rawResult[1]));
    if (!Number.isFinite(count) || !Number.isFinite(ttl)) {
      throw new Error('Redis returned non-numeric rate-limit values');
    }
    return {
      allowed: count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - count),
      retryAfterSeconds: ttl,
    };
  }
}
