import { describe, it, expect, vi } from 'vitest';
import {
  diagnoseRevisionNeeds,
  getDeterministicFallbackExplanation,
  getRevisionExplanation,
} from '@/features/spaced-repetition/revision';
import { transition } from '@/features/conversation/machine';
import {
  type ConceptRecord,
  type SpacedRepetitionStateRecord,
  type MasteryStateRecord,
} from '@/types/domain';

describe('Revision Loop & Weak Concept Engine (revision-loop.test.ts)', () => {
  const baseConcept: ConceptRecord = {
    id: 'c-current',
    title: 'Oxidative Phosphorylation',
    summary: 'ATP synthesis via proton gradient',
    canonicalExplanation: 'Protons pumped across inner mitochondrial membrane drive ATP synthase.',
    keyTerms: ['ATP synthase', 'chemiosmosis', 'proton gradient'],
    sourceChunkIds: [],
    tier: 1,
    status: 'available',
    confidence: 1,
    extractionOrder: 1,
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  };

  const prereqConcept: ConceptRecord = {
    id: 'c-prereq',
    title: 'Electron Transport Chain',
    summary: 'Electron flow through protein complexes',
    canonicalExplanation: 'Electrons from NADH and FADH2 are transferred to oxygen.',
    keyTerms: ['electron transport', 'NADH', 'protein complexes'],
    sourceChunkIds: [],
    tier: 0,
    status: 'mastered',
    confidence: 1,
    extractionOrder: 0,
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  };

  describe('diagnoseRevisionNeeds', () => {
    it('routes to prerequisite_weak when a direct prerequisite is flagged weak', () => {
      const masteryMap = new Map<string, MasteryStateRecord>();
      const srMap = new Map<string, SpacedRepetitionStateRecord>([
        [
          'c-prereq',
          {
            id: 'sr-prereq',
            conceptId: 'c-prereq',
            repetitions: 0,
            easinessFactor: 2.5,
            intervalDays: 1,
            lastReviewedAt: '2026-10-21T00:00:00Z',
            nextDueAt: '2026-10-22T00:00:00Z',
            lastQuality: 1,
            weak: true,
            updatedAt: '2026-10-21T00:00:00Z',
          },
        ],
      ]);

      const plan = diagnoseRevisionNeeds({
        concept: baseConcept,
        prerequisites: [prereqConcept],
        masteryMap,
        srMap,
        missingKeyPoints: ['Proton motive force role'],
        misconceptions: ['Electrons flow through ATP synthase directly'],
        currentDifficulty: 3,
      });

      expect(plan.type).toBe('prerequisite_weak');
      expect(plan.weakPrerequisite?.id).toBe('c-prereq');
      expect(plan.message).toBe('Review this prerequisite ("Electron Transport Chain"), then try again.');
      expect(plan.suggestedDifficulty).toBe(2); // Stepped down from 3
    });

    it('routes to prerequisite_weak when a direct prerequisite has low mastery percentage (< 50%)', () => {
      const masteryMap = new Map<string, MasteryStateRecord>([
        [
          'c-prereq',
          {
            id: 'm-prereq',
            conceptId: 'c-prereq',
            level: 1,
            percentage: 42,
            bestScore: 42,
            attemptCount: 1,
            lastAttemptAt: '2026-10-21T00:00:00Z',
            scoreHistory: [42],
            confidenceHistory: [1],
            updatedAt: '2026-10-21T00:00:00Z',
          },
        ],
      ]);
      const srMap = new Map<string, SpacedRepetitionStateRecord>();

      const plan = diagnoseRevisionNeeds({
        concept: baseConcept,
        prerequisites: [prereqConcept],
        masteryMap,
        srMap,
        currentDifficulty: 2,
      });

      expect(plan.type).toBe('prerequisite_weak');
      expect(plan.weakPrerequisite?.id).toBe('c-prereq');
      expect(plan.suggestedDifficulty).toBe(1); // Never below 1
    });

    it('routes to simplify when all prerequisites are strong, combining missing points and misconceptions', () => {
      const masteryMap = new Map<string, MasteryStateRecord>([
        [
          'c-prereq',
          {
            id: 'm-prereq',
            conceptId: 'c-prereq',
            level: 3,
            percentage: 85,
            bestScore: 85,
            attemptCount: 2,
            lastAttemptAt: '2026-10-21T00:00:00Z',
            scoreHistory: [85, 80],
            confidenceHistory: [3, 2],
            updatedAt: '2026-10-21T00:00:00Z',
          },
        ],
      ]);
      const srMap = new Map<string, SpacedRepetitionStateRecord>([
        [
          'c-prereq',
          {
            id: 'sr-prereq',
            conceptId: 'c-prereq',
            repetitions: 2,
            easinessFactor: 2.6,
            intervalDays: 6,
            lastReviewedAt: '2026-10-21T00:00:00Z',
            nextDueAt: '2026-10-27T00:00:00Z',
            lastQuality: 4,
            weak: false,
            updatedAt: '2026-10-21T00:00:00Z',
          },
        ],
      ]);

      const plan = diagnoseRevisionNeeds({
        concept: baseConcept,
        prerequisites: [prereqConcept],
        masteryMap,
        srMap,
        missingKeyPoints: ['Proton gradient coupling to ADP phosphorylation'],
        misconceptions: ['Protons pump into the matrix instead of intermembrane space'],
        currentDifficulty: 2,
      });

      expect(plan.type).toBe('simplify');
      expect(plan.weakPrerequisite).toBeUndefined();
      expect(plan.focusPoints).toContain('Proton gradient coupling to ADP phosphorylation');
      expect(plan.focusPoints).toContain(
        'Clarify: Protons pump into the matrix instead of intermembrane space',
      );
      expect(plan.suggestedDifficulty).toBe(1); // Stepped down from 2 to 1 (never below 1)
    });
  });

  describe('Deterministic Fallback Explanations', () => {
    it('builds grounded explanation using canonical explanation and focus points', () => {
      const fallback = getDeterministicFallbackExplanation(baseConcept, [
        'Proton gradient coupling',
        'Direction of proton pumping',
      ]);

      expect(fallback).toContain(baseConcept.canonicalExplanation);
      expect(fallback).toContain('Proton gradient coupling');
      expect(fallback).toContain('Direction of proton pumping');
      expect(fallback).toContain('Simplified Refresher:');
    });

    it('falls back seamlessly when network or AI service fails', async () => {
      // Mock fetch rejection
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await getRevisionExplanation({
        concept: baseConcept,
        focusPoints: ['ATP synthase mechanism'],
      });

      expect(result.isFallback).toBe(true);
      expect(result.explanation).toContain(baseConcept.canonicalExplanation);

      global.fetch = originalFetch;
    });
  });

  describe('State Machine Transitions for REVISION_DUE', () => {
    it('transitions REVISION_DUE -> STUDYING_CONCEPT on REVISE event', () => {
      const res = transition('REVISION_DUE', { type: 'REVISE' });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.next).toBe('STUDYING_CONCEPT');
        expect(res.effects.some((e) => e.type === 'LOG_LEARNING_EVENT')).toBe(true);
      }
    });

    it('transitions REVISION_DUE -> STUDYING_CONCEPT on TRY_AGAIN event', () => {
      const res = transition('REVISION_DUE', { type: 'TRY_AGAIN' });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.next).toBe('STUDYING_CONCEPT');
      }
    });

    it('transitions REVISION_DUE -> STUDY_PATH_READY on REVIEW_LATER (parks concept as weak without losing state)', () => {
      const res = transition('REVISION_DUE', { type: 'REVIEW_LATER' });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.next).toBe('STUDY_PATH_READY');
        expect(
          res.effects.some(
            (e) => e.type === 'LOG_LEARNING_EVENT' && e.eventType === 'REVISION_POSTPONED',
          ),
        ).toBe(true);
      }
    });

    it('transitions REVISION_DUE -> STUDYING_CONCEPT on eligible SELECT_CONCEPT (to study prerequisite)', () => {
      const res = transition(
        'REVISION_DUE',
        { type: 'SELECT_CONCEPT', conceptId: 'c-prereq' },
        { isConceptEligible: true },
      );
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.next).toBe('STUDYING_CONCEPT');
      }
    });

    it('guards against selecting locked concept from REVISION_DUE', () => {
      const res = transition(
        'REVISION_DUE',
        { type: 'SELECT_CONCEPT', conceptId: 'c-locked' },
        { isConceptEligible: false },
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain('Selected concept is locked');
      }
    });
  });
});
