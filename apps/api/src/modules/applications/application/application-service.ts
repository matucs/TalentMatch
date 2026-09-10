import { createHash, randomUUID } from 'node:crypto';
import { AppError, type ApplicationScoreCommand } from '@talentmatch/shared';
import type { JobRepository } from '../../jobs/ports/job-repository.js';
import type { Application, ApplyInput, CandidateProfile } from '../domain/application.js';
import type { ApplicationRepository } from '../ports/application-repository.js';
import type { ScoreCommandQueue } from '../ports/score-command-queue.js';

interface ApplicationServiceDependencies {
  readonly applications: ApplicationRepository;
  readonly jobs: JobRepository;
  readonly scoreQueue: ScoreCommandQueue;
  readonly now?: () => Date;
  readonly newId?: () => string;
  readonly onDeliveryDeferred?: (error: unknown, command: ApplicationScoreCommand) => void;
}

export interface ApplyResult {
  readonly application: Application;
  readonly replayed: boolean;
}

export class ApplicationService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  public constructor(private readonly dependencies: ApplicationServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.newId = dependencies.newId ?? randomUUID;
  }

  public async apply(
    jobId: string,
    idempotencyKey: string,
    candidateId: string,
    input: ApplyInput,
  ): Promise<ApplyResult> {
    const job = await this.dependencies.jobs.findById(jobId);
    if (job === null || job.status !== 'published') {
      throw new AppError('NOT_FOUND', 'Published job not found', 404);
    }
    const profile: CandidateProfile = {
      skills: [...new Set(input.skills.map((skill) => skill.trim().toLowerCase()))].sort(),
      experienceYears: input.experienceYears,
      city: input.city.trim(),
      remote: input.remote,
      salaryExpectation: input.salaryExpectation,
    };
    const scoreEventId = this.newId();
    const creation = await this.dependencies.applications.createIdempotent({
      id: this.newId(),
      jobId,
      candidateId,
      profile,
      idempotencyKey,
      requestFingerprint: fingerprint(jobId, candidateId, profile),
      jobSnapshot: {
        skills: job.skills,
        city: job.city,
        remote: job.remote,
        salaryMax: job.salary.max,
      },
      scoreEventId,
      now: this.now(),
    });

    if (creation.application.scoreSync.dispatchedAt === undefined) {
      await this.deliver({
        applicationId: creation.application.id,
        eventId: creation.application.scoreSync.eventId,
      });
    }
    return { application: toVisibleApplication(creation.application), replayed: creation.replayed };
  }

  public async get(id: string): Promise<Application> {
    const application = await this.dependencies.applications.findById(id);
    if (application === null) throw new AppError('NOT_FOUND', 'Application not found', 404);
    return application;
  }

  private async deliver(command: ApplicationScoreCommand): Promise<void> {
    try {
      await this.dependencies.scoreQueue.enqueue(command);
      await this.dependencies.applications.markScoreEventDispatched(
        command.applicationId,
        command.eventId,
        this.now(),
      );
    } catch (error) {
      this.dependencies.onDeliveryDeferred?.(error, command);
    }
  }
}

function fingerprint(jobId: string, candidateId: string, profile: CandidateProfile): string {
  return createHash('sha256').update(JSON.stringify({
    jobId,
    candidateId,
    skills: profile.skills,
    experienceYears: profile.experienceYears,
    city: profile.city,
    remote: profile.remote,
    salaryExpectation: profile.salaryExpectation,
  })).digest('hex');
}

function toVisibleApplication(application: Application): Application {
  return {
    id: application.id,
    jobId: application.jobId,
    candidateId: application.candidateId,
    profile: application.profile,
    status: application.status,
    ...(application.score === undefined ? {} : { score: application.score }),
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}
