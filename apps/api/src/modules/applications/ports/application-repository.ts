import type {
  Application,
  ApplicationCreation,
  CreateApplicationInput,
} from '../domain/application.js';

export interface ApplicationRepository {
  createIdempotent(input: CreateApplicationInput): Promise<ApplicationCreation>;
  findById(id: string): Promise<Application | null>;
  markScoreEventDispatched(id: string, eventId: string, dispatchedAt: Date): Promise<void>;
}
