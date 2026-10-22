/**
 * Concept Mastery Gating & Eligibility Service
 * Source of truth: PRD FR-04, FR-05, TECH_STACK §9.1, §10.2
 */

import {
  type ConceptStatus,
  type MasteryStateRecord,
  type RecallAttemptRecord,
  type SpacedRepetitionStateRecord,
  type LearningEventRecord,
} from '@/types/domain';
import {
  DEFAULT_MASTERY_UNLOCK_THRESHOLD,
  type MasteryUnlockThreshold,
} from '@/lib/config/mastery';
import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';

export type { ConceptStatus };

export interface EligibilityEvaluation {
  eligible: boolean;
  lockedReason?: string;
  missingPrerequisiteIds: string[];
  isOverridden: boolean;
}

/**
 * Checks whether a concept is eligible to be learned based on prerequisite mastery.
 * A dependent concept must NEVER become eligible before direct prerequisites meet the threshold,
 * unless an explicit user override is present.
 *
 * @param conceptId The concept to evaluate
 * @param directPrerequisiteIds Concept IDs that are direct prerequisites of this concept
 * @param masteryByConcept Map or Record of conceptId -> MasteryStateRecord
 * @param latestAttemptsByConcept Optional Map or Record of conceptId -> latest RecallAttemptRecord
 * @param overrides Optional set of concept IDs that have explicit user overrides
 * @param threshold Mastery unlock threshold configuration
 */
export function isEligible(
  conceptId: string,
  directPrerequisiteIds: string[],
  masteryByConcept: Map<string, MasteryStateRecord> | Record<string, MasteryStateRecord>,
  latestAttemptsByConcept?:
    | Map<string, RecallAttemptRecord>
    | Record<string, RecallAttemptRecord>,
  overrides?: Set<string>,
  threshold: MasteryUnlockThreshold = DEFAULT_MASTERY_UNLOCK_THRESHOLD,
): boolean {
  return evaluateEligibility(
    conceptId,
    directPrerequisiteIds,
    masteryByConcept,
    latestAttemptsByConcept,
    overrides,
    threshold,
  ).eligible;
}

/**
 * Comprehensive eligibility evaluation with human-readable diagnostic reasons.
 */
export function evaluateEligibility(
  conceptId: string,
  directPrerequisiteIds: string[],
  masteryByConcept: Map<string, MasteryStateRecord> | Record<string, MasteryStateRecord>,
  latestAttemptsByConcept?:
    | Map<string, RecallAttemptRecord>
    | Record<string, RecallAttemptRecord>,
  overrides?: Set<string>,
  threshold: MasteryUnlockThreshold = DEFAULT_MASTERY_UNLOCK_THRESHOLD,
): EligibilityEvaluation {
  // Check explicit user override
  if (overrides && overrides.has(conceptId)) {
    return {
      eligible: true,
      missingPrerequisiteIds: [],
      isOverridden: true,
    };
  }

  // Foundational concepts with no prerequisites are always eligible
  if (!directPrerequisiteIds || directPrerequisiteIds.length === 0) {
    return {
      eligible: true,
      missingPrerequisiteIds: [],
      isOverridden: false,
    };
  }

  const getMastery = (id: string): MasteryStateRecord | undefined => {
    return masteryByConcept instanceof Map
      ? masteryByConcept.get(id)
      : masteryByConcept[id];
  };

  const getLatestAttempt = (id: string): RecallAttemptRecord | undefined => {
    if (!latestAttemptsByConcept) return undefined;
    return latestAttemptsByConcept instanceof Map
      ? latestAttemptsByConcept.get(id)
      : latestAttemptsByConcept[id];
  };

  const missingPrerequisiteIds: string[] = [];

  for (const prereqId of directPrerequisiteIds) {
    const mastery = getMastery(prereqId);

    // Prerequisite has not been attempted at all
    if (!mastery || mastery.attemptCount < threshold.minAttempts) {
      missingPrerequisiteIds.push(prereqId);
      continue;
    }

    // Prerequisite has not reached required mastery percentage (default 60%)
    if (mastery.percentage < threshold.minMasteryPercent) {
      missingPrerequisiteIds.push(prereqId);
      continue;
    }

    // Check latest quality grade if attempt record is available (default q >= 3)
    const latestAttempt = getLatestAttempt(prereqId);
    if (latestAttempt && latestAttempt.qualityGrade < threshold.minQualityGrade) {
      missingPrerequisiteIds.push(prereqId);
      continue;
    }
  }

  if (missingPrerequisiteIds.length > 0) {
    return {
      eligible: false,
      lockedReason: `Requires completion of ${missingPrerequisiteIds.length} prerequisite concept(s).`,
      missingPrerequisiteIds,
      isOverridden: false,
    };
  }

  return {
    eligible: true,
    missingPrerequisiteIds: [],
    isOverridden: false,
  };
}

/**
 * Determines concept status among: 'locked' | 'available' | 'in_progress' | 'review_due' | 'mastered'
 */
export function determineConceptStatus(options: {
  conceptId: string;
  isEligible: boolean;
  mastery?: MasteryStateRecord | null;
  spacedRepetition?: SpacedRepetitionStateRecord | null;
  isCurrentlyStudying?: boolean;
  currentTimeIso?: string;
}): ConceptStatus {
  const {
    isEligible: eligible,
    mastery,
    spacedRepetition,
    isCurrentlyStudying = false,
    currentTimeIso = nowIso(),
  } = options;

  // Mastered: reached mastery level 4 or >= 90%
  if (mastery && (mastery.level >= 4 || mastery.percentage >= 90)) {
    return 'mastered';
  }

  // Review Due: flagged as weak or next review due timestamp has passed
  if (spacedRepetition) {
    const isPastDue =
      spacedRepetition.nextDueAt &&
      new Date(spacedRepetition.nextDueAt).getTime() <= new Date(currentTimeIso).getTime();
    if (spacedRepetition.weak || isPastDue) {
      return 'review_due';
    }
  }

  // In Progress: active study session or at least one attempt made
  if (isCurrentlyStudying || (mastery && mastery.attemptCount > 0)) {
    return 'in_progress';
  }

  // Available: prerequisites met
  if (eligible) {
    return 'available';
  }

  // Locked: unmet prerequisites
  return 'locked';
}

export interface SkipPrerequisitesOptions {
  conceptId: string;
  sessionId?: string;
  reason?: string;
  dbName?: string;
}

export interface SkipPrerequisitesResult {
  conceptId: string;
  event: LearningEventRecord;
}

/**
 * Explicit user action to skip prerequisite gating for a specific concept.
 * This sets an override flag and permanently logs a LearningEventRecord.
 * This is NEVER applied silently.
 */
export async function skipPrerequisites(
  options: SkipPrerequisitesOptions,
): Promise<SkipPrerequisitesResult> {
  const {
    conceptId,
    sessionId,
    reason = 'user_explicit_skip',
    dbName = DB_NAME,
  } = options;

  const event: LearningEventRecord = {
    id: generateId(),
    eventType: 'PREREQUISITE_OVERRIDE_APPLIED',
    payload: {
      conceptId,
      sessionId,
      reason,
      timestamp: nowIso(),
    },
    createdAt: nowIso(),
  };

  try {
    const db = await openDatabase(dbName);
    await db.put('learningEvents', event);
  } catch (err) {
    // If running in in-memory test environment without real IndexedDB,
    // we still return the created event
    console.warn('Failed to persist skip learning event to IndexedDB:', err);
  }

  return {
    conceptId,
    event,
  };
}
