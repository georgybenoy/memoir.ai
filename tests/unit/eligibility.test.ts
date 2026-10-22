/**
 * Mastery Gating & Eligibility Unit Tests
 * Source of truth: PRD FR-04, FR-05, TECH_STACK §10.2
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isEligible,
  evaluateEligibility,
  determineConceptStatus,
  skipPrerequisites,
} from '@/features/mastery/eligibility';
import {
  type MasteryStateRecord,
  type RecallAttemptRecord,
  type SpacedRepetitionStateRecord,
} from '@/types/domain';
import { removeDatabase, DB_NAME } from '@/lib/db/indexeddb';

function makeMastery(
  conceptId: string,
  percentage = 70,
  attemptCount = 1,
  level = 2,
): MasteryStateRecord {
  return {
    id: `mastery-${conceptId}`,
    conceptId,
    level,
    percentage,
    bestScore: percentage,
    attemptCount,
    lastAttemptAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };
}

function makeAttempt(conceptId: string, qualityGrade = 4): RecallAttemptRecord {
  return {
    id: `attempt-${conceptId}`,
    sessionId: 'session-1',
    questionId: `q-${conceptId}`,
    conceptId,
    answerText: 'Answer text',
    confidence: 'high',
    qualityGrade,
    evaluationMode: 'hybrid',
    pendingEvaluation: false,
    createdAt: '2026-10-22T00:00:00Z',
  };
}

describe('Mastery Gating & Eligibility (eligibility.ts)', () => {
  beforeEach(async () => {
    try {
      await removeDatabase(DB_NAME);
    } catch {
      // Ignore in in-memory environment
    }
  });

  describe('isEligible & evaluateEligibility', () => {
    it('always marks foundational concepts with 0 direct prerequisites as eligible', () => {
      const eligible = isEligible('FOUNDATIONAL', [], new Map());
      expect(eligible).toBe(true);

      const evaluation = evaluateEligibility('FOUNDATIONAL', [], new Map());
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.missingPrerequisiteIds.length).toBe(0);
      expect(evaluation.isOverridden).toBe(false);
    });

    it('locks a dependent concept if direct prerequisite has never been attempted', () => {
      const masteryMap = new Map<string, MasteryStateRecord>();
      const eligible = isEligible('DEP', ['PREREQ_1'], masteryMap);
      expect(eligible).toBe(false);

      const evaluation = evaluateEligibility('DEP', ['PREREQ_1'], masteryMap);
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.missingPrerequisiteIds).toEqual(['PREREQ_1']);
      expect(evaluation.lockedReason).toContain('prerequisite');
    });

    it('locks a dependent concept if prerequisite has attemptCount < minAttempts (0)', () => {
      const masteryMap = new Map<string, MasteryStateRecord>([
        ['PREREQ_1', makeMastery('PREREQ_1', 80, 0)], // 0 attempts
      ]);

      const eligible = isEligible('DEP', ['PREREQ_1'], masteryMap);
      expect(eligible).toBe(false);
    });

    it('locks a dependent concept if prerequisite mastery % is below threshold (e.g. 50% < 60%)', () => {
      const masteryMap = new Map<string, MasteryStateRecord>([
        ['PREREQ_1', makeMastery('PREREQ_1', 50, 2)], // 50% < 60%
      ]);

      const eligible = isEligible('DEP', ['PREREQ_1'], masteryMap);
      expect(eligible).toBe(false);
    });

    it('locks a dependent concept if latest attempt quality grade is below threshold (q < 3)', () => {
      const masteryMap = new Map<string, MasteryStateRecord>([
        ['PREREQ_1', makeMastery('PREREQ_1', 75, 2)],
      ]);
      const attemptsMap = new Map<string, RecallAttemptRecord>([
        ['PREREQ_1', makeAttempt('PREREQ_1', 2)], // q = 2 < 3
      ]);

      const eligible = isEligible('DEP', ['PREREQ_1'], masteryMap, attemptsMap);
      expect(eligible).toBe(false);
    });

    it('unlocks dependent concept when all direct prerequisites meet mastery threshold', () => {
      const masteryMap = new Map<string, MasteryStateRecord>([
        ['P1', makeMastery('P1', 70, 1)],
        ['P2', makeMastery('P2', 85, 2)],
      ]);
      const attemptsMap = new Map<string, RecallAttemptRecord>([
        ['P1', makeAttempt('P1', 4)],
        ['P2', makeAttempt('P2', 5)],
      ]);

      const eligible = isEligible('DEP', ['P1', 'P2'], masteryMap, attemptsMap);
      expect(eligible).toBe(true);

      const evaluation = evaluateEligibility('DEP', ['P1', 'P2'], masteryMap, attemptsMap);
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.missingPrerequisiteIds.length).toBe(0);
    });

    it('keeps concept locked if ANY prerequisite fails in a multi-prerequisite graph', () => {
      const masteryMap = new Map<string, MasteryStateRecord>([
        ['P1', makeMastery('P1', 80, 2)], // Pass
        ['P2', makeMastery('P2', 40, 1)], // Fail: 40% < 60%
      ]);

      const eligible = isEligible('DEP', ['P1', 'P2'], masteryMap);
      expect(eligible).toBe(false);

      const evaluation = evaluateEligibility('DEP', ['P1', 'P2'], masteryMap);
      expect(evaluation.missingPrerequisiteIds).toEqual(['P2']);
    });
  });

  describe('Explicit User Prerequisite Skip Override', () => {
    it('unlocks concept immediately when an explicit override exists', () => {
      const masteryMap = new Map<string, MasteryStateRecord>();
      const overrides = new Set<string>(['DEP_OVERRIDDEN']);

      const eligible = isEligible(
        'DEP_OVERRIDDEN',
        ['PREREQ_UNSTUDIED'],
        masteryMap,
        undefined,
        overrides,
      );
      expect(eligible).toBe(true);

      const evaluation = evaluateEligibility(
        'DEP_OVERRIDDEN',
        ['PREREQ_UNSTUDIED'],
        masteryMap,
        undefined,
        overrides,
      );
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.isOverridden).toBe(true);
    });

    it('creates and records a LearningEventRecord with PREREQUISITE_OVERRIDE_APPLIED', async () => {
      const result = await skipPrerequisites({
        conceptId: 'TARGET_CONCEPT',
        sessionId: 'session-123',
        reason: 'user_override_test',
      });

      expect(result.conceptId).toBe('TARGET_CONCEPT');
      expect(result.event).toBeDefined();
      expect(result.event.eventType).toBe('PREREQUISITE_OVERRIDE_APPLIED');
      expect(result.event.payload.conceptId).toBe('TARGET_CONCEPT');
      expect(result.event.payload.sessionId).toBe('session-123');
      expect(result.event.payload.reason).toBe('user_override_test');
    });
  });

  describe('determineConceptStatus', () => {
    it('returns "mastered" if mastery level >= 4 or percentage >= 90', () => {
      const status = determineConceptStatus({
        conceptId: 'C1',
        isEligible: true,
        mastery: makeMastery('C1', 95, 3, 4),
      });
      expect(status).toBe('mastered');
    });

    it('returns "review_due" if spacedRepetition is weak or past due timestamp', () => {
      const spaced: SpacedRepetitionStateRecord = {
        id: 'sr-1',
        conceptId: 'C1',
        repetitions: 1,
        easinessFactor: 2.5,
        intervalDays: 1,
        nextDueAt: '2020-01-01T00:00:00Z', // Past timestamp
        weak: true,
        updatedAt: '2026-10-22T00:00:00Z',
      };

      const status = determineConceptStatus({
        conceptId: 'C1',
        isEligible: true,
        mastery: makeMastery('C1', 60, 1, 1),
        spacedRepetition: spaced,
      });
      expect(status).toBe('review_due');
    });

    it('returns "in_progress" if currently studying or at least one attempt was made', () => {
      const status = determineConceptStatus({
        conceptId: 'C1',
        isEligible: true,
        mastery: makeMastery('C1', 40, 1, 1),
      });
      expect(status).toBe('in_progress');
    });

    it('returns "available" if eligible and not yet attempted', () => {
      const status = determineConceptStatus({
        conceptId: 'C1',
        isEligible: true,
        mastery: null,
      });
      expect(status).toBe('available');
    });

    it('returns "locked" if not eligible', () => {
      const status = determineConceptStatus({
        conceptId: 'C1',
        isEligible: false,
        mastery: null,
      });
      expect(status).toBe('locked');
    });
  });
});
