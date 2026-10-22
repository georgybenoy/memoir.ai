/**
 * Adaptive Difficulty Module
 * Source of truth: PRD FR-07, TECH_STACK §9.3
 *
 * Implements the normalized four-signal difficulty model:
 * D = 0.35 * d_DAG + 0.25 * M_session + 0.25 * (5 - q_prev)/5 + 0.15 * log2(n_attempts + 1)/log2(maxAttempts + 1)
 *
 * Subject to:
 * - Strict [0, 1] clamping per term and for total D
 * - Workspace difficulty preference modifier (beginner: -0.15, intermediate: 0, advanced: +0.15)
 * - Mapping to levels 1-5 via documented bands
 * - Single-step rise guard: a level may rise at most one step above the previous attempt's level
 */

import {
  DIFFICULTY_WEIGHTS,
  DEFAULT_MAX_ATTEMPTS,
  PREFERENCE_MODIFIERS,
  DIFFICULTY_BANDS,
} from '@/lib/config/difficulty';

export interface DifficultyCalculationInput {
  /**
   * Normalized downstream influence / DAG centrality from Phase 5 [0, 1].
   */
  downstreamInfluence?: number;

  /**
   * Session mastery rate [0, 1] (mastered / attempted).
   * If no previous evaluations in session, pass null/undefined for neutral 0.5.
   */
  sessionMasteryRate?: number | null;

  /**
   * Previous SM-2 quality grade for this concept [0, 5].
   * If this is the student's first attempt, pass null/undefined for neutral 0.5.
   */
  previousQualityGrade?: number | null;

  /**
   * Number of previous recall attempts for this concept (non-negative integer).
   */
  attemptCount?: number;

  /**
   * Previous difficulty level tested (1-5). Used for the single-step rise guard.
   */
  previousLevel?: number | null;

  /**
   * User preference from workspace settings ('beginner' | 'intermediate' | 'advanced').
   */
  userPreference?: 'beginner' | 'intermediate' | 'advanced';

  /**
   * Configurable max attempts for log2 normalization (defaults to 7).
   */
  maxAttempts?: number;
}

export interface DifficultyTermBreakdown {
  tDag: number;
  tMastery: number;
  tQuality: number;
  tAttempts: number;
  preferenceOffset: number;
  rawScore: number;
  clampedScore: number;
}

export interface AdaptiveDifficultyOutput {
  difficultyScore: number; // [0, 1]
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  levelName: string;
  riseGuarded: boolean; // True if the single-step rise guard capped the level
  breakdown: DifficultyTermBreakdown;
}

/**
 * Normalizes an attempt count using log2(n + 1) / log2(max + 1) clamped to [0, 1].
 */
export function normalizeAttempts(attempts: number, maxAttempts = DEFAULT_MAX_ATTEMPTS): number {
  if (attempts <= 0) return 0;
  const num = Math.log2(attempts + 1);
  const denom = Math.log2(Math.max(1, maxAttempts) + 1);
  return Math.min(1, Math.max(0, num / denom));
}

/**
 * Normalizes previous quality grade to [0, 1]: (5 - q) / 5.
 * Returns neutral 0.5 if no previous grade exists.
 */
export function normalizeQuality(grade?: number | null): number {
  if (grade === null || grade === undefined || isNaN(grade)) {
    return 0.5;
  }
  const clamped = Math.min(5, Math.max(0, grade));
  return (5 - clamped) / 5;
}

/**
 * Maps a continuous difficulty score in [0, 1] to a discrete difficulty level 1-5.
 */
export function mapScoreToLevel(score: number): 1 | 2 | 3 | 4 | 5 {
  const clamped = Math.min(1, Math.max(0, score));

  for (const band of DIFFICULTY_BANDS) {
    if (clamped <= band.max) {
      return band.level;
    }
  }

  return 5;
}

/**
 * Calculates adaptive difficulty score, applies preference offsets, maps to level,
 * and enforces the single-step rise rule so difficulty never spikes unreasonably.
 */
export function calculateAdaptiveDifficulty(
  input: DifficultyCalculationInput,
): AdaptiveDifficultyOutput {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  // 1. Term 1: DAG Downstream Influence in [0, 1]
  const tDag = Math.min(1, Math.max(0, input.downstreamInfluence ?? 0));

  // 2. Term 2: Session Mastery Rate in [0, 1] (neutral 0.5 if no attempts yet)
  const tMastery =
    input.sessionMasteryRate === null || input.sessionMasteryRate === undefined
      ? 0.5
      : Math.min(1, Math.max(0, input.sessionMasteryRate));

  // 3. Term 3: Previous Quality Grade normalized to [0, 1] (neutral 0.5 if first attempt)
  const tQuality = normalizeQuality(input.previousQualityGrade);

  // 4. Term 4: Attempt Count normalized via log2
  const tAttempts = normalizeAttempts(input.attemptCount ?? 0, maxAttempts);

  // 5. User Preference Offset
  const pref = input.userPreference ?? 'intermediate';
  const preferenceOffset = PREFERENCE_MODIFIERS[pref] ?? 0;

  // 6. Linear combination
  const weightedBase =
    DIFFICULTY_WEIGHTS.dag * tDag +
    DIFFICULTY_WEIGHTS.sessionMastery * tMastery +
    DIFFICULTY_WEIGHTS.previousQuality * tQuality +
    DIFFICULTY_WEIGHTS.attempts * tAttempts;

  const rawScore = weightedBase + preferenceOffset;
  const clampedScore = Math.min(1, Math.max(0, rawScore));

  // 7. Base level from bands
  const rawLevel = mapScoreToLevel(clampedScore);

  // 8. Single-step rise guard: level may rise at most 1 step above previous attempt's level
  let finalLevel = rawLevel;
  let riseGuarded = false;

  if (
    typeof input.previousLevel === 'number' &&
    input.previousLevel >= 1 &&
    input.previousLevel <= 5
  ) {
    const maxAllowedLevel = Math.min(5, input.previousLevel + 1);
    if (rawLevel > maxAllowedLevel) {
      finalLevel = maxAllowedLevel as 1 | 2 | 3 | 4 | 5;
      riseGuarded = true;
    }
  }

  const band = DIFFICULTY_BANDS.find((b) => b.level === finalLevel) ?? DIFFICULTY_BANDS[finalLevel - 1];

  return {
    difficultyScore: Number(clampedScore.toFixed(4)),
    difficultyLevel: finalLevel,
    levelName: band.name,
    riseGuarded,
    breakdown: {
      tDag,
      tMastery,
      tQuality,
      tAttempts,
      preferenceOffset,
      rawScore: Number(rawScore.toFixed(4)),
      clampedScore: Number(clampedScore.toFixed(4)),
    },
  };
}
