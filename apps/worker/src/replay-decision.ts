export type ReplayAction = 'already_scheduled' | 'blocked' | 'enqueue_missing' | 'replace_failed';

export function decideReplay(sourceState: string | null): ReplayAction {
  if (sourceState === null) return 'enqueue_missing';
  if (sourceState === 'failed') return 'replace_failed';
  if (
    sourceState === 'active'
    || sourceState === 'completed'
    || sourceState === 'delayed'
    || sourceState === 'paused'
    || sourceState === 'prioritized'
    || sourceState === 'waiting'
    || sourceState === 'waiting-children'
  ) return 'already_scheduled';
  return 'blocked';
}
