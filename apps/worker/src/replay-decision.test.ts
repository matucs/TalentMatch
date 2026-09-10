import { describe, expect, it } from 'vitest';
import { decideReplay } from './replay-decision.js';

describe('decideReplay', () => {
  it('replaces an exhausted source job but retains its event ID', () => {
    expect(decideReplay('failed')).toBe('replace_failed');
  });

  it('enqueues a missing source job after a crash between removal and re-add', () => {
    expect(decideReplay(null)).toBe('enqueue_missing');
  });

  it.each(['active', 'completed', 'delayed', 'waiting']) (
    'treats %s jobs as already scheduled',
    (state) => expect(decideReplay(state)).toBe('already_scheduled'),
  );

  it('blocks unknown states rather than guessing', () => {
    expect(decideReplay('unknown')).toBe('blocked');
  });
});
