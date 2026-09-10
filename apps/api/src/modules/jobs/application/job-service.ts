import { randomUUID } from 'node:crypto';
import { AppError, type JobIndexCommand } from '@talentmatch/shared';
import type { CreateJobInput, Job, JobMutation } from '../domain/job.js';
import type { IndexCommandQueue } from '../ports/index-command-queue.js';
import type { JobRepository } from '../ports/job-repository.js';

interface JobServiceDependencies {
  readonly repository: JobRepository;
  readonly indexQueue: IndexCommandQueue;
  readonly now?: () => Date;
  readonly newId?: () => string;
  readonly onDeliveryDeferred?: (error: unknown, command: JobIndexCommand) => void;
  readonly invalidateSearch?: () => Promise<void>;
  readonly onInvalidationDeferred?: (error: unknown) => void;
}

export class JobService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  public constructor(private readonly dependencies: JobServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.newId = dependencies.newId ?? randomUUID;
  }

  public async create(input: CreateJobInput): Promise<Job> {
    const normalized: CreateJobInput = {
      ...input,
      title: input.title.trim(),
      description: input.description.trim(),
      city: input.city.trim(),
      skills: [...new Set(input.skills.map((skill) => skill.trim().toLowerCase()))].sort(),
      salary: { ...input.salary, currency: input.salary.currency.toUpperCase() },
    };
    return this.dependencies.repository.create(this.newId(), normalized, this.now());
  }

  public async get(id: string): Promise<Job> {
    const job = await this.dependencies.repository.findById(id);
    if (job === null) throw new AppError('NOT_FOUND', 'Job not found', 404);
    return job;
  }

  public async publish(id: string, employerId: string): Promise<Job> {
    await this.assertEmployer(id, employerId);
    const mutation = await this.dependencies.repository.publishDraft(
      id,
      this.newId(),
      this.now(),
    );
    if (mutation === null) {
      throw await this.transitionError(id, 'Only draft jobs can be published');
    }
    await this.invalidateSearch();
    await this.deliver(mutation);
    return toVisibleJob(mutation.job);
  }

  public async delete(id: string, employerId: string): Promise<void> {
    await this.assertEmployer(id, employerId);
    const mutation = await this.dependencies.repository.softDelete(
      id,
      this.newId(),
      this.now(),
    );
    if (mutation === null) throw new AppError('NOT_FOUND', 'Job not found', 404);
    await this.invalidateSearch();
    await this.deliver(mutation);
  }

  private async invalidateSearch(): Promise<void> {
    if (this.dependencies.invalidateSearch === undefined) return;
    try {
      await this.dependencies.invalidateSearch();
    } catch (error) {
      // The index processor invalidates again after applying the command.
      this.dependencies.onInvalidationDeferred?.(error);
    }
  }

  private async deliver(mutation: JobMutation): Promise<void> {
    const command: JobIndexCommand = {
      eventId: mutation.event.eventId,
      jobId: mutation.job.id,
      operation: mutation.event.operation,
    };
    try {
      await this.dependencies.indexQueue.enqueue(command);
      await this.dependencies.repository.markEventDispatched(
        command.jobId,
        command.eventId,
        this.now(),
      );
    } catch (error) {
      // The marker remains pending in MongoDB. The worker relay retries delivery.
      this.dependencies.onDeliveryDeferred?.(error, command);
    }
  }

  private async transitionError(id: string, message: string): Promise<AppError> {
    const existing = await this.dependencies.repository.findById(id);
    if (existing === null) return new AppError('NOT_FOUND', 'Job not found', 404);
    return new AppError('CONFLICT', message, 409);
  }

  private async assertEmployer(id: string, employerId: string): Promise<void> {
    const job = await this.dependencies.repository.findById(id);
    if (job === null) throw new AppError('NOT_FOUND', 'Job not found', 404);
    if (job.employerId !== employerId) {
      throw new AppError('FORBIDDEN', 'Employer does not own this job', 403);
    }
  }
}

function toVisibleJob(job: JobMutation['job']): Job {
  if (job.status === 'deleted') throw new Error('Deleted jobs cannot be returned');
  return {
    id: job.id,
    employerId: job.employerId,
    title: job.title,
    description: job.description,
    city: job.city,
    remote: job.remote,
    skills: job.skills,
    salary: job.salary,
    status: job.status,
    version: job.version,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.publishedAt === undefined ? {} : { publishedAt: job.publishedAt }),
  };
}
