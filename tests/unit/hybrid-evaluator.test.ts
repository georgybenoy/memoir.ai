import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HybridAnswerEvaluator } from '@/features/evaluation/evaluator';
import { MockEmbeddingProvider } from '@/features/evaluation/embeddings';
import { type AnswerEvaluationInput } from '@/features/evaluation/types';
import * as aiClient from '@/lib/ai/client';
import { openDatabase, closeDatabase, removeDatabase } from '@/lib/db/indexeddb';
import { type ConceptRecord, type DocumentChunkRecord } from '@/types/domain';

describe('HybridAnswerEvaluator (hybrid-evaluator.test.ts)', () => {
  const TEST_DB = 'test-hybrid-evaluator-db';

  const mockConcept: ConceptRecord = {
    id: 'concept-1',
    title: 'Cellular Respiration',
    summary: 'Biochemical pathways producing ATP.',
    canonicalExplanation: 'Glycolysis, Krebs cycle, and electron transport chain generate ATP.',
    keyTerms: ['glycolysis', 'Krebs cycle', 'ATP'],
    sourceChunkIds: ['c1'],
    tier: 1,
    status: 'available',
    confidence: 1,
    extractionOrder: 1,
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };

  const mockChunks: DocumentChunkRecord[] = [
    {
      id: 'c1',
      documentId: 'doc-1',
      chunkIndex: 0,
      text: 'Glycolysis produces pyruvate and NADH in the cytoplasm.',
      startOffset: 0,
      endOffset: 53,
      contentHash: 'hash-1',
      createdAt: '2026-10-22T00:00:00Z',
    },
  ];

  const mockInput: AnswerEvaluationInput = {
    sessionId: 'session-123',
    concept: mockConcept,
    question: {
      id: 'q-101',
      conceptId: 'concept-1',
      prompt: 'Explain the main stages of cellular respiration.',
      questionStyle: 'explanation',
      referencePoints: ['glycolysis', 'Krebs cycle'],
      expectedKeyPoints: ['Glycolysis in cytoplasm', 'Krebs cycle in matrix', 'Electron transport chain in cristae'],
      sourceChunkIds: ['c1'],
      difficulty: 3,
      createdAt: '2026-10-22T00:00:00Z',
    },
    answerText: 'Cellular respiration begins with glycolysis in the cytoplasm, followed by the Krebs cycle and the electron transport chain.',
    confidence: 3,
    sourceChunks: mockChunks,
  };

  const validRubricResponse = {
    correctness: 90,
    completeness: 85,
    terminology: 90,
    reasoning: 85,
    relevance: 95,
    misconceptions: [],
    missingKeyPoints: [],
    strengths: ['Accurate staging of glycolysis and Krebs cycle'],
    correctionGuidance: 'Keep reviewing ATP synthase proton gradients.',
    suggestedNextAction: 'Ready to continue to the next concept.',
    rationale: 'Demonstrated solid grasp of cellular respiration pathways.',
  };

  beforeEach(async () => {
    closeDatabase();
    await removeDatabase(TEST_DB);
    const db = await openDatabase(TEST_DB);
    await db.put('concepts', mockConcept);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Mode 1: Hybrid Evaluation (Both Pillars Succeed)', () => {
    it('computes composite score from 0.40 * sem + 0.60 * judge and derives quality grade', async () => {
      // Mock embedding cosine = 0.72 -> calibrated score: (0.72 - 0.20)/(0.85 - 0.20) * 100 = 80
      const mockEmbedding = new MockEmbeddingProvider({ simulatedCosine: 0.72 });
      vi.spyOn(aiClient, 'fetchEvaluateAnswer').mockResolvedValue(validRubricResponse);

      const evaluator = new HybridAnswerEvaluator({
        embeddingProvider: mockEmbedding,
        dbName: TEST_DB,
      });

      const result = await evaluator.evaluate(mockInput);

      expect(result.evaluationMode).toBe('hybrid');
      expect(result.pendingEvaluation).toBe(false);
      expect(result.semanticScore).toBe(80);
      // Judge weighted score = 90*0.35 + 85*0.25 + 85*0.20 + 90*0.10 + 95*0.10 = 31.5 + 21.25 + 17 + 9 + 9.5 = 88.25
      expect(result.judgeScore).toBe(88.25);
      // Composite = 0.40 * 80 + 0.60 * 88.25 = 32 + 52.95 = 84.95 -> q = 4
      expect(result.compositeScore).toBe(84.95);
      expect(result.qualityGrade).toBe(4);

      // Verify atomic persistence to IndexedDB
      const db = await openDatabase(TEST_DB);
      const attempt = await db.get('recallAttempts', result.attemptId);
      expect(attempt).toBeDefined();
      expect(attempt?.evaluationMode).toBe('hybrid');
      expect(attempt?.compositeScore).toBe(84.95);

      const mastery = await db.getFromIndex('masteryStates', 'by-concept', mockConcept.id);
      expect(mastery).toBeDefined();
      expect(mastery?.percentage).toBe(85);
    });
  });

  describe('Mode 2: Judge-Only Evaluation (Semantic Embedding Fails/Unavailable)', () => {
    it('sets mode to judge_only, leaves compositeScore null, and derives grade from judge score', async () => {
      // Force embedding provider failure (simulating worker timeout or ONNX load failure)
      const failingEmbedding = new MockEmbeddingProvider({
        shouldFail: true,
        failureMessage: 'Embedding Web Worker timed out',
      });
      vi.spyOn(aiClient, 'fetchEvaluateAnswer').mockResolvedValue(validRubricResponse);

      const evaluator = new HybridAnswerEvaluator({
        embeddingProvider: failingEmbedding,
        dbName: TEST_DB,
      });

      const result = await evaluator.evaluate(mockInput);

      expect(result.evaluationMode).toBe('judge_only');
      expect(result.pendingEvaluation).toBe(false);
      expect(result.semanticScore).toBeUndefined();
      expect(result.compositeScore).toBeUndefined(); // Never claims to be hybrid!
      expect(result.judgeScore).toBe(88.25);
      expect(result.qualityGrade).toBe(5); // 88.25 >= 85 -> q5
      expect(result.rationale).toContain('Judge-only evaluation: semantic check was unavailable');

      // Verify persistence reflects judge_only with null compositeScore
      const db = await openDatabase(TEST_DB);
      const attempt = await db.get('recallAttempts', result.attemptId);
      expect(attempt?.evaluationMode).toBe('judge_only');
      expect(attempt?.compositeScore).toBeNull();
      expect(attempt?.judgeScore).toBe(88.25);
    });
  });

  describe('Mode 3: Pending Evaluation (Gemini Judge Unavailable / Offline)', () => {
    it('saves attempt as pendingEvaluation: true, does not modify mastery, and offers retry', async () => {
      const mockEmbedding = new MockEmbeddingProvider({ simulatedCosine: 0.75 });
      // Simulate Gemini API outage (503 AI_NOT_CONFIGURED or network failure)
      vi.spyOn(aiClient, 'fetchEvaluateAnswer').mockRejectedValue(
        new Error('AI_NOT_CONFIGURED: Gemini API key is missing'),
      );

      const evaluator = new HybridAnswerEvaluator({
        embeddingProvider: mockEmbedding,
        dbName: TEST_DB,
      });

      const result = await evaluator.evaluate(mockInput);

      expect(result.evaluationMode).toBe('pending');
      expect(result.pendingEvaluation).toBe(true);
      expect(result.compositeScore).toBeUndefined();
      expect(result.judgeScore).toBeUndefined();
      expect(result.rationale).toContain('pending');
      expect(result.nextAction).toContain('retry');

      // Verify attempt is saved with pendingEvaluation: true
      const db = await openDatabase(TEST_DB);
      const attempt = await db.get('recallAttempts', result.attemptId);
      expect(attempt).toBeDefined();
      expect(attempt?.pendingEvaluation).toBe(true);

      // Verify mastery was NOT created or modified for pending attempts
      const mastery = await db.getFromIndex('masteryStates', 'by-concept', mockConcept.id);
      expect(mastery).toBeUndefined();
    });

    it('handles total pillar failure (both semantic and judge fail) cleanly into pending evaluation', async () => {
      const failingEmbedding = new MockEmbeddingProvider({
        shouldFail: true,
        failureMessage: 'Embedding worker terminated unexpectedly',
      });
      vi.spyOn(aiClient, 'fetchEvaluateAnswer').mockRejectedValue(
        new Error('Network offline: Failed to fetch judge rubric'),
      );

      const evaluator = new HybridAnswerEvaluator({
        embeddingProvider: failingEmbedding,
        dbName: TEST_DB,
      });

      const result = await evaluator.evaluate(mockInput);

      expect(result.evaluationMode).toBe('pending');
      expect(result.pendingEvaluation).toBe(true);
      expect(result.compositeScore).toBeUndefined();
      expect(result.semanticScore).toBeUndefined();
      expect(result.judgeScore).toBeUndefined();
      expect(result.nextAction).toContain('retry');

      const db = await openDatabase(TEST_DB);
      const attempt = await db.get('recallAttempts', result.attemptId);
      expect(attempt).toBeDefined();
      expect(attempt?.pendingEvaluation).toBe(true);
      expect(attempt?.evaluationMode).toBe('pending');
    });
  });

  describe('Metacognitive Calibration Integration', () => {
    it('produces non-shaming feedback on overconfident failing attempts (conf=3, q<=2)', async () => {
      const mockEmbedding = new MockEmbeddingProvider({ simulatedCosine: 0.2 });
      vi.spyOn(aiClient, 'fetchEvaluateAnswer').mockResolvedValue({
        correctness: 20,
        completeness: 20,
        reasoning: 20,
        terminology: 20,
        relevance: 50,
        misconceptions: [
          { description: 'Claimed cellular respiration creates oxygen', severity: 'critical', correction: 'It consumes oxygen' },
        ],
        missingKeyPoints: ['Glycolysis', 'Krebs cycle'],
        strengths: [],
        correctionGuidance: 'Review the direction of gas exchange in mitochondria.',
        suggestedNextAction: 'Review source notes on cellular respiration.',
        rationale: 'Major misconceptions regarding respiratory inputs and outputs.',
      });

      const evaluator = new HybridAnswerEvaluator({
        embeddingProvider: mockEmbedding,
        dbName: TEST_DB,
      });

      const result = await evaluator.evaluate({
        ...mockInput,
        confidence: 3, // High confidence despite severe error
      });

      expect(result.qualityGrade).toBeLessThanOrEqual(2);
      expect(result.confidenceFeedback).toContain('Claimed cellular respiration creates oxygen');
      expect(result.confidenceFeedback).not.toMatch(/foolish|fail|wrong/i);
    });
  });
});
