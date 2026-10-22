/**
 * SM-2 and Spaced Repetition Scheduling Configuration
 * Source of truth: PRD FR-11, TECH_STACK §10.3, docs/DECISIONS.md
 */

export interface Sm2Config {
  /** Initial Easiness Factor for new concepts. Standard SM-2 baseline is 2.5. */
  initialEf: number;
  /** Hard floor for Easiness Factor. Prevents runaway difficulty traps. Standard SM-2 is 1.30. */
  minEf: number;
  /** Interval in days after the first successful recall (repetition 0 -> 1). Default: 1 day. */
  rep1IntervalDays: number;
  /** Interval in days after the second consecutive successful recall (repetition 1 -> 2). Default: 6 days. */
  rep2IntervalDays: number;
  /**
   * Whether to reduce the Easiness Factor when an attempt fails (quality grade < 3).
   * Default: false (per docs/DECISIONS.md: failure resets repetitions and interval to 1 day
   * without punishing the long-term easiness factor, unless explicitly enabled).
   */
  updateEfOnFailure: boolean;
  /** Minimum quality grade required to count as a successful recall (0-5 scale). */
  minQualityPass: number;
}

export const DEFAULT_SM2_CONFIG: Sm2Config = {
  initialEf: 2.5,
  minEf: 1.3,
  rep1IntervalDays: 1,
  rep2IntervalDays: 6,
  updateEfOnFailure: false,
  minQualityPass: 3,
};
