/**
 * Pure Scoring Functions
 * Source of truth: PRD FR-08, TECH_STACK §10.2, docs/SCORING.md
 */

import {
  HYBRID_WEIGHTS,
  GRADE_THRESHOLDS,
  JUDGE_RUBRIC_WEIGHTS,
  MISCONCEPTION_PENALTIES,
  MAX_MISCONCEPTION_PENALTY,
  COSINE_CALIBRATION,
} from '@/lib/config/scoring';

export interface MisconceptionItem {
  description: string;
  severity: 'minor' | 'moderate' | 'critical';
  correction: string;
  penalty?: number;
}

export interface JudgeRubricInput {
  correctness: number; // 0-100
  completeness: number; // 0-100
  reasoning: number; // 0-100
  terminology: number; // 0-100
  relevance: number; // 0-100
  misconceptions?: MisconceptionItem[];
}

/**
 * Clamps and sanitizes any numeric score to [min, max].
 * NaN, null, undefined, or infinities resolve safely to min.
 */
export function normalizeScore(value: number | null | undefined, min = 0, max = 100): number {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return Math.round(value * 100) / 100;
}

/**
 * Computes deterministic judge score in [0, 100] from rubric components
 * and subtracts capped misconception penalties.
 */
export function computeJudgeScore(rubric: JudgeRubricInput): number {
  const correctness = normalizeScore(rubric.correctness);
  const completeness = normalizeScore(rubric.completeness);
  const reasoning = normalizeScore(rubric.reasoning);
  const terminology = normalizeScore(rubric.terminology);
  const relevance = normalizeScore(rubric.relevance);

  const weightedRubric =
    correctness * JUDGE_RUBRIC_WEIGHTS.correctness +
    completeness * JUDGE_RUBRIC_WEIGHTS.completeness +
    reasoning * JUDGE_RUBRIC_WEIGHTS.reasoning +
    terminology * JUDGE_RUBRIC_WEIGHTS.terminology +
    relevance * JUDGE_RUBRIC_WEIGHTS.relevance;

  // Calculate total misconception penalties
  let totalPenalty = 0;
  if (rubric.misconceptions && Array.isArray(rubric.misconceptions)) {
    for (const item of rubric.misconceptions) {
      const p = item.penalty ?? MISCONCEPTION_PENALTIES[item.severity] ?? 5;
      totalPenalty += p;
    }
  }

  const cappedPenalty = Math.min(totalPenalty, MAX_MISCONCEPTION_PENALTY);
  const finalJudgeScore = Math.max(0, weightedRubric - cappedPenalty);

  return Math.round(finalJudgeScore * 100) / 100;
}

/**
 * Computes hybrid composite score = 0.40 * sem + 0.60 * judge.
 *
 * CRITICAL RULE (TECH_STACK §8, §10.2):
 * Returns a number ONLY when BOTH sem and judge are valid finite numbers in [0, 100].
 * If either is missing, null, undefined, NaN, or out of range, returns NULL.
 */
export function computeComposite(
  sem: number | null | undefined,
  judge: number | null | undefined,
): number | null {
  if (
    sem === null ||
    sem === undefined ||
    typeof sem !== 'number' ||
    !Number.isFinite(sem) ||
    sem < 0 ||
    sem > 100
  ) {
    return null;
  }

  if (
    judge === null ||
    judge === undefined ||
    typeof judge !== 'number' ||
    !Number.isFinite(judge) ||
    judge < 0 ||
    judge > 100
  ) {
    return null;
  }

  const composite = sem * HYBRID_WEIGHTS.semantic + judge * HYBRID_WEIGHTS.judge;
  return Math.round(composite * 100) / 100;
}

/**
 * Maps a score in [0, 100] to an SM-2 quality grade q in [0, 5].
 * Exact boundary specification:
 * - 85 <= score <= 100 -> 5
 * - 70 <= score < 85   -> 4
 * - 55 <= score < 70   -> 3
 * - 40 <= score < 55   -> 2
 * - 25 <= score < 40   -> 1
 * - score < 25         -> 0
 *
 * Invalid inputs (NaN, null, undefined) safely return 0.
 */
export function toQualityGrade(score: number | null | undefined): number {
  if (score === null || score === undefined || typeof score !== 'number' || !Number.isFinite(score)) {
    return 0;
  }

  if (score >= GRADE_THRESHOLDS.q5) return 5;
  if (score >= GRADE_THRESHOLDS.q4) return 4;
  if (score >= GRADE_THRESHOLDS.q3) return 3;
  if (score >= GRADE_THRESHOLDS.q2) return 2;
  if (score >= GRADE_THRESHOLDS.q1) return 1;
  return 0;
}

/**
 * Converts embedding cosine similarity to a calibrated [0, 100] semantic score.
 * Linear mapping from [minCosine, maxCosine] to [0, 100], clamped.
 */
export function cosineToSemanticScore(cosine: number): number {
  if (typeof cosine !== 'number' || !Number.isFinite(cosine)) {
    return 0;
  }
  const { minCosine, maxCosine } = COSINE_CALIBRATION;
  const scaled = ((cosine - minCosine) / (maxCosine - minCosine)) * 100;
  return normalizeScore(scaled, 0, 100);
}
