import type { JobIndexCommand } from '@talentmatch/shared';

export interface IndexCommandQueue {
  enqueue(command: JobIndexCommand): Promise<void>;
}
