/**
 * Concept Mastery Service
 * Source of truth: PRD FR-10, TECH_STACK §5.2, §10.2, docs/SCORING.md
 */

import { generateId } from '@/lib/utils/id';
import { nowIso } from '@/lib/utils/clock';
import { openDatabase, DB_NAME, runTransaction } from '@/lib/db/indexeddb';
import {
  type ConceptRecord,
  type RecallAttemptRecord,
  type MasteryStateRecord,
  type MasteryLevel,
  type SpacedRepetitionStateRecord,
  type LearningEventRecord,
} from '@/types/domain';
import { MASTERY_CONFIG } from '@/lib/config/scoring';
import { evaluateEligibility, determineConceptStatus } from './eligibility';
import { calculateNextSm2State } from '@/features/spaced-repetition/sm2';

/**
 * Computes the recency-weighted mastery percentage from historical attempt scores.
 * @param scores Historical scores with index 0 being the most recent attempt.
 * @param weights Configurable recency weights (default [0.45, 0.25, 0.15, 0.10, 0.05]).
 */
export function computeMasteryPercentage(
  scores: number[],
  weights: readonly number[] = MASTERY_CONFIG.recencyWeights,
): number {
  if (!scores || scores.length === 0) return 0;

  const k = Math.min(scores.length, weights.length);
  let weightSum = 0;
  for (let i = 0; i < k; i++) {
    weightSum += weights[i];
  }

  if (weightSum <= 0) return 0;

  let weightedTotal = 0;
  for (let i = 0; i < k; i++) {
    weightedTotal += (weights[i] / weightSum) * scores[i];
  }

  const clamped = Math.max(0, Math.min(100, weightedTotal));
  return Math.round(clamped * 10) / 10;
}

/**
 * Determines concept mastery level (0-4 and named union).
 *
 * CRITICAL RULE (PRD FR-10, docs/SCORING.md):
 * "Mastery is never inferred from one high score alone."
 * Reaching 'mastered' (level 4) requires:
 * 1. Mastery percentage >= 85
 * 2. At least two attempts with q >= 4
 * 3. The two qualifying attempts took place on separate calendar days
 *
 * If criteria 2 or 3 are not met, the level is capped at 'proficient' (level 3).
 */
export function determineMasteryLevel(
  percentage: number,
  attempts: Array<{ qualityGrade: number; createdAt: string }>,
): { level: number; masteryLevel: MasteryLevel } {
  if (attempts.length === 0) {
    return { level: 0, masteryLevel: 'new' };
  }

  const { levelThresholds, masteredMinAttempts, masteredMinPassingGrade } = MASTERY_CONFIG;

  if (percentage >= levelThresholds.mastered) {
    // Check separate-day qualifying attempts (q >= 4)
    const qualifyingAttempts = attempts.filter((a) => a.qualityGrade >= masteredMinPassingGrade);

    if (qualifyingAttempts.length >= masteredMinAttempts) {
      // Check distinct calendar days (YYYY-MM-DD from ISO timestamp)
      const distinctDays = new Set(
        qualifyingAttempts.map((a) => {
          try {
            return new Date(a.createdAt).toISOString().slice(0, 10);
          } catch {
            return a.createdAt.slice(0, 10);
          }
        }),
      );

      if (distinctDays.size >= 2) {
        return { level: 4, masteryLevel: 'mastered' };
      }
    }

    // High percentage but lacks multiple-day confirmation -> capped at proficient
    return { level: 3, masteryLevel: 'proficient' };
  }

  if (percentage >= levelThresholds.proficient) {
    return { level: 3, masteryLevel: 'proficient' };
  }

  if (percentage >= levelThresholds.familiar) {
    return { level: 2, masteryLevel: 'familiar' };
  }

  if (percentage >= levelThresholds.learning) {
    return { level: 1, masteryLevel: 'learning' };
  }

  return { level: 0, masteryLevel: 'new' };
}

export interface CalculateMasteryInput {
  conceptId: string;
  currentMastery: MasteryStateRecord | null;
  newAttempt: {
    score: number;
    qualityGrade: number;
    confidence: number;
    createdAt: string;
  };
  pastAttempts: Array<{
    score: number;
    qualityGrade: number;
    confidence: number;
    createdAt: string;
  }>;
}

/**
 * Pure calculation updating MasteryStateRecord with a new attempt.
 */
export function calculateMasteryUpdate(input: CalculateMasteryInput): MasteryStateRecord {
  const { conceptId, currentMastery, newAttempt, pastAttempts } = input;

  const allAttempts = [newAttempt, ...pastAttempts];
  const scoreHistory = allAttempts.map((a) => a.score);
  const confidenceHistory = allAttempts.map((a) => a.confidence);

  const percentage = computeMasteryPercentage(scoreHistory);
  const bestScore = Math.max(currentMastery?.bestScore ?? 0, newAttempt.score);
  const attemptCount = (currentMastery?.attemptCount ?? 0) + 1;

  const { level, masteryLevel } = determineMasteryLevel(percentage, allAttempts);

  const reviewStatus =
    newAttempt.qualityGrade < 3 ? 'due' : currentMastery?.reviewStatus ?? 'none';

  return {
    id: currentMastery?.id ?? generateId(),
    conceptId,
    level,
    percentage,
    masteryLevel,
    masteryPercent: percentage,
    bestScore,
    attemptCount,
    lastAttemptAt: newAttempt.createdAt,
    reviewStatus,
    scoreHistory: scoreHistory.slice(0, 20),
    confidenceHistory: confidenceHistory.slice(0, 20),
    updatedAt: nowIso(),
  };
}

export interface SaveAttemptAndMasteryOptions {
  attempt: RecallAttemptRecord;
  currentMastery: MasteryStateRecord | null;
  currentSr?: SpacedRepetitionStateRecord | null;
  pastAttempts: RecallAttemptRecord[];
  timeZone?: string;
  dbName?: string;
}

export interface SaveAttemptAndMasteryResult {
  attempt: RecallAttemptRecord;
  mastery: MasteryStateRecord;
  spacedRepetition: SpacedRepetitionStateRecord;
  concept: ConceptRecord | null;
}

/**
 * Persists attempt record, mastery state update, and concept status changes
 * in ONE atomic IndexedDB transaction via runTransaction.
 *
 * If any store write fails (e.g. QuotaExceededError or schema fault), the entire
 * transaction rolls back and throws, ensuring no corrupted or partial state.
 *
 * After the transaction commits, triggers recalculateEligibility to unlock
 * any newly eligible downstream concepts.
 */
export async function saveAttemptAndMasteryAtomic(
  options: SaveAttemptAndMasteryOptions,
): Promise<SaveAttemptAndMasteryResult> {
  const { attempt, currentMastery, currentSr, pastAttempts, timeZone, dbName = DB_NAME } = options;

  const effectiveScore = attempt.compositeScore ?? attempt.judgeScore ?? 0;
  const numConfidence =
    typeof attempt.confidence === 'number'
      ? attempt.confidence
      : attempt.confidence === 'high'
        ? 3
        : attempt.confidence === 'low'
          ? 1
          : 2;

  const updatedMastery = calculateMasteryUpdate({
    conceptId: attempt.conceptId,
    currentMastery,
    newAttempt: {
      score: effectiveScore,
      qualityGrade: attempt.qualityGrade,
      confidence: numConfidence,
      createdAt: attempt.createdAt,
    },
    pastAttempts: pastAttempts.map((p) => ({
      score: p.compositeScore ?? p.judgeScore ?? 0,
      qualityGrade: p.qualityGrade,
      confidence:
        typeof p.confidence === 'number'
          ? p.confidence
          : p.confidence === 'high'
            ? 3
            : p.confidence === 'low'
              ? 1
              : 2,
      createdAt: p.createdAt,
    })),
  });

  const { record: updatedSr } = calculateNextSm2State({
    conceptId: attempt.conceptId,
    currentSr: currentSr ?? null,
    qualityGrade: attempt.qualityGrade,
    reviewInstant: attempt.createdAt,
    timeZone,
  });

  const stores = [
    'recallAttempts',
    'masteryStates',
    'spacedRepetitionStates',
    'concepts',
    'learningEvents',
  ] as const;

  let committedConcept: ConceptRecord | null = null;

  await runTransaction(
    [...stores],
    'readwrite',
    async (tx) => {
      // 1. Persist the attempt record
      await tx.objectStore('recallAttempts').put(attempt);

      // 2. Persist updated mastery record
      await tx.objectStore('masteryStates').put(updatedMastery);

      // 3. Persist updated spaced repetition state
      await tx.objectStore('spacedRepetitionStates').put(updatedSr);

      // 4. Update concept status if needed
      const conceptStore = tx.objectStore('concepts');
      const concept = (await conceptStore.get(attempt.conceptId)) as ConceptRecord | undefined;
      if (concept) {
        if (updatedMastery.masteryLevel === 'mastered') {
          concept.status = 'mastered';
        } else if (updatedSr.weak) {
          concept.status = 'review_due';
        } else if (concept.status === 'available' || concept.status === 'locked') {
          concept.status = 'in_progress';
        }
        concept.updatedAt = nowIso();
        await conceptStore.put(concept);
        committedConcept = concept;
      }

      // 5. Log learning event
      const eventRecord: LearningEventRecord = {
        id: generateId(),
        eventType: 'ATTEMPT_EVALUATED',
        payload: {
          conceptId: attempt.conceptId,
          attemptId: attempt.id,
          qualityGrade: attempt.qualityGrade,
          evaluationMode: attempt.evaluationMode,
          masteryPercent: updatedMastery.percentage,
          masteryLevel: updatedMastery.masteryLevel,
          repetitions: updatedSr.repetitions,
          intervalDays: updatedSr.intervalDays,
          easinessFactor: updatedSr.easinessFactor,
          nextDueAt: updatedSr.nextDueAt,
          weak: updatedSr.weak,
        },
        createdAt: nowIso(),
      };
      await tx.objectStore('learningEvents').put(eventRecord);
    },
    dbName,
  );

  // After atomic transaction commits, re-evaluate downstream eligibility
  try {
    await recalculateEligibility(attempt.conceptId, dbName);
  } catch (err) {
    console.warn('Post-attempt eligibility recalculation warning:', err);
  }

  return {
    attempt,
    mastery: updatedMastery,
    spacedRepetition: updatedSr,
    concept: committedConcept,
  };
}

/**
 * Re-evaluates prerequisite eligibility for downstream dependent concepts
 * after a concept's mastery changes, unlocking eligible concepts.
 */
export async function recalculateEligibility(
  triggerConceptId?: string,
  dbName = DB_NAME,
): Promise<void> {
  const db = await openDatabase(dbName);
  const concepts = await db.getAll('concepts');
  const dependencies = await db.getAll('conceptDependencies');
  const masteryList = await db.getAll('masteryStates');
  const attempts = await db.getAll('recallAttempts');
  const srList = await db.getAll('spacedRepetitionStates');

  // Build prerequisite map: dependentConceptId -> list of prerequisiteIds
  const prereqsByDependent = new Map<string, string[]>();
  for (const dep of dependencies) {
    if (dep.removed) continue;
    const current = prereqsByDependent.get(dep.dependentConceptId) ?? [];
    current.push(dep.prerequisiteId);
    prereqsByDependent.set(dep.dependentConceptId, current);
  }

  const masteryMap = new Map<string, MasteryStateRecord>();
  for (const m of masteryList) {
    masteryMap.set(m.conceptId, m);
  }

  const srMap = new Map<string, SpacedRepetitionStateRecord>();
  for (const sr of srList) {
    srMap.set(sr.conceptId, sr);
  }

  const latestAttemptsMap = new Map<string, RecallAttemptRecord>();
  for (const a of attempts) {
    const existing = latestAttemptsMap.get(a.conceptId);
    if (!existing || new Date(a.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      latestAttemptsMap.set(a.conceptId, a);
    }
  }

  for (const concept of concepts) {
    if (concept.status === 'mastered') continue;

    const prereqs = prereqsByDependent.get(concept.id) ?? [];
    const evaluation = evaluateEligibility(concept.id, prereqs, masteryMap, latestAttemptsMap);
    const newStatus = determineConceptStatus({
      conceptId: concept.id,
      isEligible: evaluation.eligible,
      mastery: masteryMap.get(concept.id),
      spacedRepetition: srMap.get(concept.id),
    });

    if (newStatus !== concept.status) {
      concept.status = newStatus;
      concept.updatedAt = nowIso();
      await db.put('concepts', concept);
    }
  }
}
