/**
 * Mastery & Eligibility Configuration
 * Source of truth: PRD FR-04, FR-05, TECH_STACK §10.2
 */

export interface MasteryUnlockThreshold {
  /** Minimum number of recall attempts on prerequisite concept */
  minAttempts: number;
  /** Minimum SM-2 quality grade achieved on the latest attempt (0-5, where >=3 is passing) */
  minQualityGrade: number;
  /** Minimum mastery percentage (0-100) */
  minMasteryPercent: number;
}

export const DEFAULT_MASTERY_UNLOCK_THRESHOLD: MasteryUnlockThreshold = {
  minAttempts: 1,
  minQualityGrade: 3,
  minMasteryPercent: 60,
};
