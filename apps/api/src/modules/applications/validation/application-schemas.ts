import { z } from '@talentmatch/validation';

export const idempotencyKeySchema = z.string().trim().min(1).max(128)
  .regex(/^[\x21-\x7E]+$/, 'Idempotency key must contain visible ASCII characters only');

export const applicationIdParamsSchema = z.object({ applicationId: z.string().uuid() }).strict();

export const applySchema = z.object({
  skills: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
  experienceYears: z.number().min(0).max(80),
  city: z.string().trim().min(1).max(120),
  remote: z.boolean(),
  salaryExpectation: z.number().int().nonnegative(),
}).strict();
