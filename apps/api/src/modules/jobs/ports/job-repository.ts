import type { CreateJobInput, Job, JobMutation } from '../domain/job.js';

export interface JobRepository {
  create(id: string, input: CreateJobInput, now: Date): Promise<Job>;
  findById(id: string): Promise<Job | null>;
  publishDraft(id: string, eventId: string, now: Date): Promise<JobMutation | null>;
  softDelete(id: string, eventId: string, now: Date): Promise<JobMutation | null>;
  markEventDispatched(id: string, eventId: string, dispatchedAt: Date): Promise<void>;
}
