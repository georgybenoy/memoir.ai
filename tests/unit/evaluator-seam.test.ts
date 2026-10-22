import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  NotImplementedEvaluator,
  FakeAnswerEvaluator,
} from '@/features/evaluation/evaluator';
import { type AnswerEvaluationInput } from '@/features/evaluation/types';
import { transition } from '@/features/conversation/machine';
import { type MachineContext } from '@/features/conversation/types';
import { openDatabase, DB_NAME } from '@/lib/db/indexeddb';

describe('Evaluator Seam & State Machine Driving (evaluator-seam.test.ts)', () => {
  const mockInput: AnswerEvaluationInput = {
    sessionId: 'session-123',
    concept: {
      id: 'concept-1',
      title: 'Mitochondria & Cellular Respiration',
      summary: 'Powerhouse of the cell generating ATP via oxidative phosphorylation.',
      canonicalExplanation: 'Cristae foldings provide surface area for ATP synthase complexes.',
      keyTerms: ['cristae', 'ATP synthase', 'matrix'],
      sourceChunkIds: ['c1'],
      tier: 1,
      status: 'available',
      confidence: 0.9,
      extractionOrder: 1,
      createdAt: '2026-10-22T00:00:00Z',
      updatedAt: '2026-10-22T00:00:00Z',
    },
    question: {
      id: 'q-456',
      conceptId: 'concept-1',
      prompt: 'How do cristae structure maximize ATP production in mitochondria?',
      questionStyle: 'explanation',
      referencePoints: ['cristae', 'ATP synthase'],
      expectedKeyPoints: ['Increased surface area', 'ATP synthase enzymes'],
      sourceChunkIds: ['c1'],
      difficulty: 3,
      createdAt: '2026-10-22T00:00:00Z',
    },
    answerText: 'Cristae provide a large surface area for ATP synthase proteins to produce ATP.',
    confidence: 3,
  };

  describe('NotImplementedEvaluator', () => {
    it('returns polite pending notice and saves draft attempt in IndexedDB', async () => {
      const evaluator = new NotImplementedEvaluator();
      const output = await evaluator.evaluate(mockInput);

      expect(output.pendingEvaluation).toBe(true);
      expect(output.evaluationMode).toBe('fallback');
      expect(output.qualityGrade).toBe(3);
      expect(output.rationale).toContain('Answer checking arrives in the next update');
      expect(output.strengths).toContain('Answer safely recorded on this device.');
      expect(output.confidenceFeedback).toContain('High confidence noted');

      // Verify record was written to IndexedDB
      const db = await openDatabase(DB_NAME);
      const attempt = await db.get('recallAttempts', output.attemptId);
      expect(attempt).toBeDefined();
      expect(attempt?.answerText).toBe(mockInput.answerText);
      expect(attempt?.confidence).toBe('high');
      expect(attempt?.pendingEvaluation).toBe(true);
    });

    it('adapts confidence feedback for low confidence answers', async () => {
      const evaluator = new NotImplementedEvaluator();
      const output = await evaluator.evaluate({ ...mockInput, confidence: 1 });
      expect(output.confidenceFeedback).toContain('Low confidence noted');
    });
  });

  describe('FakeAnswerEvaluator', () => {
    it('evaluates with configurable passing grades and feedback', async () => {
      const fake = new FakeAnswerEvaluator({
        qualityGrade: 5,
        compositeScore: 95,
        strengths: ['Flawless explanation of cristae folding'],
      });

      const output = await fake.evaluate(mockInput);
      expect(output.qualityGrade).toBe(5);
      expect(output.compositeScore).toBe(95);
      expect(output.strengths).toContain('Flawless explanation of cristae folding');
      expect(output.pendingEvaluation).toBe(false);
    });

    it('evaluates with configurable failing grades and missing points', async () => {
      const fake = new FakeAnswerEvaluator({
        qualityGrade: 1,
        compositeScore: 25,
        missingKeyPoints: ['Did not mention surface area'],
      });

      const output = await fake.evaluate(mockInput);
      expect(output.qualityGrade).toBe(1);
      expect(output.compositeScore).toBe(25);
      expect(output.missingKeyPoints).toContain('Did not mention surface area');
    });
  });

  describe('End-to-End State Machine Driving with Fake Evaluator', () => {
    it('drives from WAITING_FOR_ANSWER through EVALUATION, FEEDBACK, to NEXT_CONCEPT on passing grade', async () => {
      const fake = new FakeAnswerEvaluator({ qualityGrade: 4 });
      const evalResult = await fake.evaluate(mockInput);

      const ctx: MachineContext = {
        currentConceptId: 'concept-1',
        confidenceSelected: true,
        hasMoreConcepts: true,
        allConceptsMastered: false,
      };

      // 1. Submit answer from WAITING_FOR_ANSWER -> EVALUATING
      const step1 = transition(
        'WAITING_FOR_ANSWER',
        { type: 'SUBMIT_ANSWER', answerText: mockInput.answerText, confidence: 3 },
        ctx,
      );
      expect(step1.ok).toBe(true);
      if (!step1.ok) return;
      expect(step1.next).toBe('EVALUATING');

      // 2. Evaluation succeeds -> FEEDBACK
      const step2 = transition(
        'EVALUATING',
        { type: 'EVALUATION_SUCCESS', qualityGrade: evalResult.qualityGrade },
        ctx,
      );
      expect(step2.ok).toBe(true);
      if (!step2.ok) return;
      expect(step2.next).toBe('FEEDBACK');

      // 3. User continues from FEEDBACK -> NEXT_CONCEPT
      const feedbackCtx: MachineContext = {
        ...ctx,
        lastQualityGrade: evalResult.qualityGrade,
        hasMoreConcepts: true,
        allConceptsMastered: false,
      };
      const step3 = transition('FEEDBACK', { type: 'CONTINUE' }, feedbackCtx);
      expect(step3.ok).toBe(true);
      if (!step3.ok) return;
      expect(step3.next).toBe('NEXT_CONCEPT');
    });

    it('drives to COMPLETED when continuing after final concept is mastered', async () => {
      const fake = new FakeAnswerEvaluator({ qualityGrade: 5 });
      const evalResult = await fake.evaluate(mockInput);

      const feedbackCtx: MachineContext = {
        currentConceptId: 'concept-final',
        lastQualityGrade: evalResult.qualityGrade,
        hasMoreConcepts: false,
        allConceptsMastered: true,
      };

      const step = transition('FEEDBACK', { type: 'CONTINUE' }, feedbackCtx);
      expect(step.ok).toBe(true);
      if (!step.ok) return;
      expect(step.next).toBe('COMPLETED');
      expect(step.effects.some((e) => e.type === 'LOG_LEARNING_EVENT' && e.eventType === 'PATH_COMPLETED')).toBe(true);
    });

    it('drives to REVISION_DUE on failing grade and user selecting REVISE', async () => {
      const fake = new FakeAnswerEvaluator({ qualityGrade: 1 });
      const evalResult = await fake.evaluate(mockInput);

      const feedbackCtx: MachineContext = {
        currentConceptId: 'concept-1',
        lastQualityGrade: evalResult.qualityGrade,
      };

      // Trying to CONTINUE with failing grade is guarded against
      const invalidContinue = transition('FEEDBACK', { type: 'CONTINUE' }, feedbackCtx);
      expect(invalidContinue.ok).toBe(false);
      if (!invalidContinue.ok) {
        expect(invalidContinue.error).toContain('grade < 3');
      }

      // Choosing REVISE -> REVISION_DUE
      const reviseStep = transition('FEEDBACK', { type: 'REVISE' }, feedbackCtx);
      expect(reviseStep.ok).toBe(true);
      if (!reviseStep.ok) return;
      expect(reviseStep.next).toBe('REVISION_DUE');

      // Choosing TRY_AGAIN from REVISION_DUE -> STUDYING_CONCEPT
      const tryAgainStep = transition('REVISION_DUE', { type: 'TRY_AGAIN' }, feedbackCtx);
      expect(tryAgainStep.ok).toBe(true);
      if (!tryAgainStep.ok) return;
      expect(tryAgainStep.next).toBe('STUDYING_CONCEPT');
    });
  });
});
