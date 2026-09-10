import { z } from '@talentmatch/validation';

function optionalBoolean(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

function skillsList(value: unknown): unknown {
  if (value === undefined || value === '') return [];
  const values: unknown[] = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) => typeof entry === 'string' ? entry.split(',') : [entry]);
}

export const jobSearchQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().min(1).max(120).toLowerCase().optional(),
  remote: z.preprocess(optionalBoolean, z.boolean().optional()),
  skills: z.preprocess(
    skillsList,
    z.array(z.string().trim().min(1).max(80)).max(20).transform((skills) => (
      [...new Set(skills.map((skill) => skill.toLowerCase()))].sort()
    )),
  ),
  salaryMin: z.coerce.number().int().nonnegative().optional(),
  salaryMax: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['relevance', 'newest', 'salary_asc', 'salary_desc']).default('relevance'),
}).strict().superRefine((query, context) => {
  if (
    query.salaryMin !== undefined
    && query.salaryMax !== undefined
    && query.salaryMin > query.salaryMax
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['salaryMin'],
      message: 'Minimum salary cannot exceed maximum salary',
    });
  }
  if (query.page * query.limit > 10_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['page'],
      message: 'Requested page exceeds the 10,000-result offset window',
    });
  }
});

export const autocompleteQuerySchema = z.object({
  prefix: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
}).strict();

export const jobSearchDocumentSchema = z.object({
  id: z.string(),
  employerId: z.string(),
  title: z.string(),
  description: z.string(),
  city: z.string(),
  remote: z.boolean(),
  skills: z.array(z.string()),
  salary: z.object({ min: z.number(), max: z.number(), currency: z.string() }),
  publishedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const jobSearchResultSchema = z.object({
  items: z.array(jobSearchDocumentSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
});
