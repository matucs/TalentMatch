export type ErrorCode =
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR';

export interface ErrorDetail {
  readonly field?: string;
  readonly message: string;
}

export interface ErrorResponse {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly requestId: string;
    readonly details?: readonly ErrorDetail[];
  };
}

export class AppError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: readonly ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export interface DependencyStatus {
  readonly name: string;
  readonly status: 'up' | 'down';
}

export const JOB_INDEX_QUEUE = 'job-indexing';
export const JOB_INDEX_DLQ = 'job-indexing-dead-letter';
export const APPLICATION_SCORE_QUEUE = 'application-scoring';
export const APPLICATION_SCORE_DLQ = 'application-scoring-dead-letter';

export type JobIndexOperation = 'delete' | 'upsert';

export interface JobIndexCommand {
  readonly eventId: string;
  readonly jobId: string;
  readonly operation: JobIndexOperation;
}

export interface ApplicationScoreCommand {
  readonly eventId: string;
  readonly applicationId: string;
}

export interface MatchScore {
  readonly score: number;
  readonly matchedSkills: readonly string[];
  readonly missingSkills: readonly string[];
  readonly breakdown: {
    readonly skills: number;
    readonly experience: number;
    readonly location: number;
    readonly salary: number;
  };
}

export interface DeadLetterRecord<TCommand> {
  readonly command: TCommand;
  readonly failedReason: string;
  readonly attemptsMade: number;
  readonly failedAt: string;
}

// Mappings are immutable in OpenSearch. Bump this version when the search
// document mapping changes so a fresh, compatible projection can be built.
export const JOB_SEARCH_INDEX = 'talentmatch-jobs-v2';
export const SEARCH_CACHE_VERSION_KEY = 'search:version';

export interface JobSearchDocument {
  readonly id: string;
  readonly employerId: string;
  readonly title: string;
  readonly description: string;
  readonly city: string;
  readonly remote: boolean;
  readonly skills: readonly string[];
  readonly salary: {
    readonly min: number;
    readonly max: number;
    readonly currency: string;
  };
  readonly publishedAt: string;
  readonly updatedAt: string;
}

export function createJobSearchIndexDefinition() {
  return {
    settings: {
      analysis: {
        normalizer: {
          lowercase_normalizer: {
            type: 'custom' as const,
            filter: ['lowercase', 'asciifolding'],
          },
        },
      },
    },
    mappings: {
      dynamic: 'strict' as const,
      properties: {
        id: { type: 'keyword' as const },
        employerId: { type: 'keyword' as const },
        title: {
          type: 'text' as const,
          fields: {
            raw: { type: 'keyword' as const, normalizer: 'lowercase_normalizer' },
            autocomplete: { type: 'search_as_you_type' as const },
          },
        },
        description: { type: 'text' as const },
        city: {
          type: 'text' as const,
          fields: { raw: { type: 'keyword' as const, normalizer: 'lowercase_normalizer' } },
        },
        remote: { type: 'boolean' as const },
        skills: { type: 'keyword' as const, normalizer: 'lowercase_normalizer' },
        salary: {
          properties: {
            min: { type: 'integer' as const },
            max: { type: 'integer' as const },
            currency: { type: 'keyword' as const },
          },
        },
        publishedAt: { type: 'date' as const },
        updatedAt: { type: 'date' as const },
        // Mirrors publishedAt so OpenSearch Dashboards Discover can use the default time field.
        '@timestamp': { type: 'date' as const },
      },
    },
  };
}
