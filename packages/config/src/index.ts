import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/talentmatch'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  OPENSEARCH_NODE: z.string().url().default('http://localhost:9200'),
  OPENSEARCH_AWS_REGION: z.string().min(1).optional(),
  DEPENDENCY_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(100),
  SEARCH_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
  ENABLE_SWAGGER: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  ENABLE_DEMO: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  AUTH_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  OIDC_ISSUER_URL: z.string().url().optional(),
  OIDC_AUDIENCE: z.string().min(1).optional(),
  OIDC_JWKS_URL: z.string().url().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
}).superRefine((config, context) => {
  if (!config.AUTH_ENABLED) return;
  for (const field of ['OIDC_ISSUER_URL', 'OIDC_AUDIENCE', 'OIDC_JWKS_URL'] as const) {
    if (config[field] === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required when authentication is enabled`,
      });
    }
  }
});

export type AppConfig = z.infer<typeof environmentSchema>;

export class ConfigurationError extends Error {
  public constructor(public readonly issues: readonly string[]) {
    super(`Invalid configuration: ${issues.join('; ')}`);
    this.name = 'ConfigurationError';
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new ConfigurationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
