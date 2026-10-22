/**
 * Pure SM-2 Spaced Repetition Scheduling Engine
 * Source of truth: PRD FR-11, TECH_STACK §10.3, docs/DECISIONS.md
 *
 * Implements the SuperMemo-2 spaced repetition algorithm with clock injection,
 * local start-of-day due-date semantics, timezone stability, DST resilience,
 * and clock-skew detection.
 */

import { now, nowIso } from '@/lib/utils/clock';
import { generateId } from '@/lib/utils/id';
import { DEFAULT_SM2_CONFIG, type Sm2Config } from '@/lib/config/scheduling';
import { type SpacedRepetitionStateRecord } from '@/types/domain';

export interface Sm2CalculationInput {
  conceptId: string;
  currentSr: SpacedRepetitionStateRecord | null;
  qualityGrade: number; // 0 to 5
  reviewInstant?: Date | string;
  timeZone?: string;
  config?: Partial<Sm2Config>;
}

export interface Sm2CalculationOutput {
  record: SpacedRepetitionStateRecord;
  clockSkewDetected: boolean;
  clockSkewNote?: string;
}

/**
 * Computes the updated Easiness Factor (EF) according to the SM-2 formula:
 * EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 * Clamped at minEf (standard 1.30).
 */
export function computeNewEf(
  currentEf: number,
  quality: number,
  minEf = DEFAULT_SM2_CONFIG.minEf,
): number {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const updated = currentEf + delta;
  const rounded = Math.round(updated * 100) / 100;
  return Math.max(minEf, rounded);
}

/**
 * Computes the exact UTC instant corresponding to 00:00:00 (start-of-day)
 * in the user's local IANA timezone, advanced by intervalDays.
 *
 * Handles DST transitions (spring-forward 23h and fall-back 25h days)
 * and leap years deterministically.
 */
export function computeLocalStartOfDay(
  baseDate: Date,
  intervalDays: number,
  timeZone: string,
): string {
  const validDays = Math.max(0, Math.floor(intervalDays));
  const validTz = timeZone || 'UTC';

  // Extract base calendar date in target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: validTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const parts = formatter.formatToParts(baseDate);
  const partMap: Record<string, string> = {};
  for (const p of parts) partMap[p.type] = p.value;

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);

  // Advance by intervalDays in local calendar
  const targetDate = new Date(Date.UTC(year, month - 1, day + validDays, 12, 0, 0));
  const tParts = formatter.formatToParts(targetDate);
  const tMap: Record<string, string> = {};
  for (const p of tParts) tMap[p.type] = p.value;

  const tYear = parseInt(tMap.year, 10);
  const tMonth = parseInt(tMap.month, 10);
  const tDay = parseInt(tMap.day, 10);

  // Iteratively converge to 00:00:00 local time in validTz
  let estimateUtc = Date.UTC(tYear, tMonth - 1, tDay, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const efParts = new Intl.DateTimeFormat('en-US', {
      timeZone: validTz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(new Date(estimateUtc));

    const efMap: Record<string, string> = {};
    for (const p of efParts) efMap[p.type] = p.value;

    const efH = parseInt(efMap.hour === '24' ? '0' : efMap.hour, 10);
    const efM = parseInt(efMap.minute, 10);
    const efS = parseInt(efMap.second, 10);
    const efDay = parseInt(efMap.day, 10);

    const dayDiff = efDay - tDay;
    const diffMs = ((dayDiff * 24 + efH) * 60 + efM) * 60 * 1000 + efS * 1000;
    estimateUtc -= diffMs;
    if (diffMs === 0) break;
  }

  return new Date(estimateUtc).toISOString();
}

/**
 * Checks if a concept is due for review.
 * A concept is due when the current instant >= nextDueAt.
 */
export function isReviewDue(nextDueAt: string, currentInstant: Date | string = now()): boolean {
  if (!nextDueAt) return false;
  const dueTime = new Date(nextDueAt).getTime();
  const checkTime =
    typeof currentInstant === 'string'
      ? new Date(currentInstant).getTime()
      : currentInstant.getTime();
  return checkTime >= dueTime;
}

/**
 * Pure calculation function for SuperMemo-2 spaced repetition state.
 *
 * Behavioral rules:
 * 1. q >= 3 (Passing recall):
 *    - Repetition 0 -> 1: interval = 1 day
 *    - Repetition 1 -> 2: interval = 6 days
 *    - Repetition n >= 2: interval = round(previousInterval * EF), min 1
 *    - EF updated via SM-2 formula, floored at minEf (1.30)
 *    - weak = false
 *
 * 2. q < 3 (Failing recall):
 *    - Repetitions reset to 0
 *    - Interval resets to 1 day
 *    - weak = true (concept flagged for revision)
 *    - EF is untouched UNLESS config.updateEfOnFailure = true
 *
 * 3. Clock skew protection:
 *    - If device clock moved backwards and current time is earlier than lastReviewedAt,
 *      we avoid negative intervals, treat review date as today, and set clockSkewDetected = true.
 */
export function calculateNextSm2State(input: Sm2CalculationInput): Sm2CalculationOutput {
  const { conceptId, currentSr, qualityGrade, config: customConfig } = input;
  const cfg: Sm2Config = { ...DEFAULT_SM2_CONFIG, ...customConfig };

  const reviewDate =
    input.reviewInstant instanceof Date
      ? input.reviewInstant
      : typeof input.reviewInstant === 'string'
        ? new Date(input.reviewInstant)
        : now();

  const timeZone =
    input.timeZone ||
    (typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC') ||
    'UTC';

  const q = Math.max(0, Math.min(5, Math.round(qualityGrade)));
  const isPassing = q >= cfg.minQualityPass;

  const currentEf = currentSr?.easinessFactor ?? cfg.initialEf;
  const currentReps = currentSr?.repetitions ?? 0;
  const currentInterval = currentSr?.intervalDays ?? 0;

  // Detect backwards clock anomaly
  let clockSkewDetected = false;
  let clockSkewNote: string | undefined;
  if (currentSr?.lastReviewedAt) {
    const prevTime = new Date(currentSr.lastReviewedAt).getTime();
    if (reviewDate.getTime() < prevTime) {
      clockSkewDetected = true;
      clockSkewNote =
        'Device clock moved backwards relative to previous review; interval anchored to current date.';
    }
  }

  let newReps: number;
  let newInterval: number;
  let newEf: number;
  let isWeak: boolean;

  if (isPassing) {
    // Quality grade >= 3: successful recall
    isWeak = false;
    newReps = currentReps + 1;
    newEf = computeNewEf(currentEf, q, cfg.minEf);

    if (newReps === 1) {
      newInterval = cfg.rep1IntervalDays; // default 1 day
    } else if (newReps === 2) {
      newInterval = cfg.rep2IntervalDays; // default 6 days
    } else {
      // Repetition >= 3: interval = round(previousInterval * EF)
      const baseInterval = currentInterval > 0 ? currentInterval : cfg.rep2IntervalDays;
      newInterval = Math.max(1, Math.round(baseInterval * newEf));
    }
  } else {
    // Quality grade < 3: failed recall
    isWeak = true;
    newReps = 0;
    newInterval = cfg.rep1IntervalDays; // reset to 1 day
    // Update EF on failure only if explicitly configured
    newEf = cfg.updateEfOnFailure ? computeNewEf(currentEf, q, cfg.minEf) : currentEf;
  }

  const reviewInstantIso = reviewDate.toISOString();
  const nextDueAt = computeLocalStartOfDay(reviewDate, newInterval, timeZone);

  const record: SpacedRepetitionStateRecord = {
    id: currentSr?.id ?? generateId(),
    conceptId,
    repetitions: newReps,
    easinessFactor: newEf,
    intervalDays: newInterval,
    lastReviewedAt: reviewInstantIso,
    nextDueAt,
    lastQuality: q,
    weak: isWeak,
    updatedAt: nowIso(),
  };

  return {
    record,
    clockSkewDetected,
    clockSkewNote,
  };
}
