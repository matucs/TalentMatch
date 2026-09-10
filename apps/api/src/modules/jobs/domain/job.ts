export type JobStatus = 'draft' | 'published';
export type StoredJobStatus = JobStatus | 'deleted';

export interface SalaryRange {
  readonly min: number;
  readonly max: number;
  readonly currency: string;
}

export interface IndexSyncEvent {
  readonly eventId: string;
  readonly operation: 'delete' | 'upsert';
  readonly pendingSince: Date;
  readonly dispatchedAt?: Date;
}

export interface Job {
  readonly id: string;
  readonly employerId: string;
  readonly title: string;
  readonly description: string;
  readonly city: string;
  readonly remote: boolean;
  readonly skills: readonly string[];
  readonly salary: SalaryRange;
  readonly status: JobStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt?: Date;
}

export interface StoredJob extends Omit<Job, 'status'> {
  readonly status: StoredJobStatus;
  readonly deletedAt?: Date;
  readonly indexSync?: IndexSyncEvent;
}

export interface CreateJobInput {
  readonly employerId: string;
  readonly title: string;
  readonly description: string;
  readonly city: string;
  readonly remote: boolean;
  readonly skills: readonly string[];
  readonly salary: SalaryRange;
}

export interface JobMutation {
  readonly job: StoredJob;
  readonly event: IndexSyncEvent;
}
