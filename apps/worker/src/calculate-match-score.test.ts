import { describe, expect, it } from 'vitest';
import { calculateMatchScore } from './calculate-match-score.js';

describe('calculateMatchScore', () => {
  it('returns deterministic weighted scoring and skill differences', () => {
    expect(calculateMatchScore({
      skills: ['typescript', 'node.js'],
      experienceYears: 5,
      city: 'Graz',
      remote: true,
      salaryExpectation: 90_000,
    }, {
      skills: ['typescript', 'mongodb', 'node.js'],
      city: 'Vienna',
      remote: true,
      salaryMax: 100_000,
    })).toEqual({
      score: 80,
      matchedSkills: ['node.js', 'typescript'],
      missingSkills: ['mongodb'],
      breakdown: { skills: 40, experience: 10, location: 20, salary: 10 },
    });
  });

  it('does not award location or salary points when expectations do not match', () => {
    const result = calculateMatchScore({
      skills: ['typescript'], experienceYears: 0, city: 'Berlin', remote: false,
      salaryExpectation: 120_000,
    }, {
      skills: ['typescript'], city: 'Vienna', remote: true, salaryMax: 100_000,
    });
    expect(result.breakdown).toEqual({ skills: 60, experience: 10, location: 0, salary: 0 });
    expect(result.score).toBe(70);
  });
});
