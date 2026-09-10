import { z } from 'zod';

export const requestIdSchema = z.string().trim().min(1).max(128);

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum([
      'BAD_REQUEST',
      'CONFLICT',
      'FORBIDDEN',
      'INTERNAL_ERROR',
      'NOT_FOUND',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE',
      'UNAUTHORIZED',
      'VALIDATION_ERROR',
    ]),
    message: z.string(),
    requestId: z.string(),
    details: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional(),
  }),
});

export function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  return schema.parse(input);
}

export { z };
