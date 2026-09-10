import type { MatchScore } from '@talentmatch/shared';

export interface ScoreCandidate {
  readonly skills: readonly string[];
  readonly experienceYears: number;
  readonly city: string;
  readonly remote: boolean;
  readonly salaryExpectation: number;
}

export interface ScoreJob {
  readonly skills: readonly string[];
  readonly city: string;
  readonly remote: boolean;
  readonly salaryMax: number;
}

export function calculateMatchScore(candidate: ScoreCandidate, job: ScoreJob): MatchScore {
  const candidateSkills = new Set(candidate.skills.map((skill) => skill.toLowerCase()));
  const requiredSkills = [...new Set(job.skills.map((skill) => skill.toLowerCase()))].sort();
  const matchedSkills = requiredSkills.filter((skill) => candidateSkills.has(skill));
  const missingSkills = requiredSkills.filter((skill) => !candidateSkills.has(skill));

  const skills = requiredSkills.length === 0
    ? 60
    : Math.round((matchedSkills.length / requiredSkills.length) * 60);
  // Jobs do not yet carry an experience requirement. This neutral component is
  // explicit and deterministic until the job aggregate gains that field.
  const experience = 10;
  const location = (
    candidate.city.trim().toLowerCase() === job.city.trim().toLowerCase()
    || (job.remote && candidate.remote)
  ) ? 20 : 0;
  const salary = candidate.salaryExpectation <= job.salaryMax ? 10 : 0;

  return {
    score: skills + experience + location + salary,
    matchedSkills,
    missingSkills,
    breakdown: { skills, experience, location, salary },
  };
}
