import { z } from '@talentmatch/validation';

export const jobIdParamsSchema = z.object({
  jobId: z.string().uuid(),
}).strict();

export const createJobSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(20).max(10_000),
  city: z.string().trim().min(1).max(120),
  remote: z.boolean(),
  skills: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
  salary: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().positive(),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  }).strict(),
}).strict().superRefine((job, context) => {
  if (job.salary.min > job.salary.max) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['salary', 'min'],
      message: 'Minimum salary cannot exceed maximum salary',
    });
  }
});

export type CreateJobRequest = z.infer<typeof createJobSchema>;
