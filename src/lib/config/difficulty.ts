/**
 * Difficulty Configuration
 * Source of truth: PRD FR-07, TECH_STACK §9.3
 */

export const DIFFICULTY_WEIGHTS = {
  dag: 0.35,
  sessionMastery: 0.25,
  previousQuality: 0.25,
  attempts: 0.15,
} as const;

export const DEFAULT_MAX_ATTEMPTS = 7;

export const PREFERENCE_MODIFIERS = {
  beginner: -0.15,
  intermediate: 0.0,
  advanced: 0.15,
} as const;

export interface DifficultyBand {
  level: 1 | 2 | 3 | 4 | 5;
  name: string;
  min: number;
  max: number; // inclusive upper bound for the band
  description: string;
}

export const DIFFICULTY_BANDS: readonly DifficultyBand[] = [
  {
    level: 1,
    name: 'Elementary',
    min: 0.0,
    max: 0.2,
    description: 'Foundational recall of basic terms and core definition.',
  },
  {
    level: 2,
    name: 'Foundational',
    min: 0.2,
    max: 0.4,
    description: 'Comprehension of mechanism and relationship to direct prerequisites.',
  },
  {
    level: 3,
    name: 'Intermediate',
    min: 0.4,
    max: 0.6,
    description: 'Application to standard scenarios and procedural reasoning.',
  },
  {
    level: 4,
    name: 'Advanced',
    min: 0.6,
    max: 0.8,
    description: 'Cross-concept comparisons, cause-and-effect, and systemic implications.',
  },
  {
    level: 5,
    name: 'Mastery',
    min: 0.8,
    max: 1.0,
    description: 'Synthesis, edge-case analysis, and misconception diagnosis.',
  },
] as const;
