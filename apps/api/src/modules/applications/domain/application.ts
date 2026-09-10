import type { MatchScore } from '@talentmatch/shared';

export interface CandidateProfile {
  readonly skills: readonly string[];
  readonly experienceYears: number;
  readonly city: string;
  readonly remote: boolean;
  readonly salaryExpectation: number;
}

export interface JobScoreSnapshot {
  readonly skills: readonly string[];
  readonly city: string;
  readonly remote: boolean;
  readonly salaryMax: number;
}

export interface ScoreSyncEvent {
  readonly eventId: string;
  readonly pendingSince: Date;
  readonly dispatchedAt?: Date;
}

export interface Application {
  readonly id: string;
  readonly jobId: string;
  readonly candidateId: string;
  readonly profile: CandidateProfile;
  readonly status: 'score_failed' | 'scoring' | 'scored';
  readonly score?: MatchScore;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StoredApplication extends Application {
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly jobSnapshot: JobScoreSnapshot;
  readonly scoreSync: ScoreSyncEvent;
}

export type ApplyInput = CandidateProfile;

export interface CreateApplicationInput {
  readonly id: string;
  readonly jobId: string;
  readonly candidateId: string;
  readonly profile: CandidateProfile;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly jobSnapshot: JobScoreSnapshot;
  readonly scoreEventId: string;
  readonly now: Date;
}

export interface ApplicationCreation {
  readonly application: StoredApplication;
  readonly replayed: boolean;
}
