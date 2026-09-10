import type { DependencyStatus } from '@talentmatch/shared';
import type { Logger } from '@talentmatch/logger';
import type {
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';

export type ApiInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  Logger
>;

export interface HealthCheck {
  readonly name: string;
  check(): Promise<void>;
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly dependencies: readonly DependencyStatus[];
}
