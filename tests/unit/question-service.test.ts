import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import {
  computeTokenOverlap,
  isNearDuplicate,
  selectNextQuestionStyle,
  generateFallbackQuestionTemplate,
  getOrGenerateRecallQuestion,
} from '@/features/recall/question-service';
import { type ConceptRecord, type DocumentChunkRecord } from '@/types/domain';
import { QUESTION_STYLES, type QuestionStyle } from '@/lib/ai/schemas';
import * as aiClient from '@/lib/ai/client';

describe('Recall Question Service (question-service.ts)', () => {
  const mockConcept: ConceptRecord = {
    id: 'c-101',
    title: 'Photosynthesis',
    summary: 'The biochemical process converting sunlight, carbon dioxide, and water into glucose and oxygen.',
    canonicalExplanation: 'Light reactions in thylakoid membranes produce ATP and NADPH; the Calvin cycle fixes carbon in the stroma.',
    keyTerms: ['chlorophyll', 'thylakoid', 'Calvin cycle', 'ATP', 'glucose'],
    sourceChunkIds: ['chunk-1', 'chunk-2'],
    tier: 1,
    status: 'available',
    confidence: 0.95,
    extractionOrder: 1,
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };

  const mockChunks: DocumentChunkRecord[] = [
    {
      id: 'chunk-1',
      documentId: 'doc-1',
      chunkIndex: 0,
      text: 'Light reactions occur in thylakoid membranes and produce ATP.',
      startOffset: 0,
      endOffset: 59,
      contentHash: 'h1',
      createdAt: '2026-10-22T00:00:00Z',
    },
    {
      id: 'chunk-2',
      documentId: 'doc-1',
      chunkIndex: 1,
      text: 'The Calvin cycle takes place in the stroma and synthesizes glucose.',
      startOffset: 60,
      endOffset: 127,
      contentHash: 'h2',
      createdAt: '2026-10-22T00:00:00Z',
    },
  ];

  describe('Token Overlap & Duplicate Detection', () => {
    it('computes 1.0 for identical sentences', () => {
      const text = 'Explain how the light reaction produces ATP in thylakoids.';
      expect(computeTokenOverlap(text, text)).toBe(1.0);
    });

    it('computes 0.0 for completely disjoint sentences', () => {
      const text1 = 'Binary search algorithm operates in logarithmic time.';
      const text2 = 'Cellular respiration occurs inside mitochondria.';
      expect(computeTokenOverlap(text1, text2)).toBe(0);
    });

    it('detects near-duplicates when token overlap exceeds threshold', () => {
      const prompt1 = 'Explain how light reactions generate ATP in the chloroplast.';
      const prompt2 = 'Explain how light reactions produce ATP in chloroplasts.';
      expect(isNearDuplicate(prompt2, [prompt1], 0.6)).toBe(true);
    });

    it('permits distinct questions about the same concept', () => {
      const prompt1 = 'Explain the chemical inputs and outputs of the light reactions.';
      const prompt2 = 'Compare the Calvin cycle in the stroma with the thylakoid light reactions.';
      expect(isNearDuplicate(prompt2, [prompt1], 0.7)).toBe(false);
    });
  });

  describe('Style Rotation', () => {
    it('rotates across styles avoiding immediate repeats', () => {
      const recent: QuestionStyle[] = ['explanation'];
      const nextStyle = selectNextQuestionStyle(recent);
      expect(nextStyle).not.toBe('explanation');
      expect(QUESTION_STYLES.includes(nextStyle)).toBe(true);
    });

    it('honors preferred style if not used in the immediate last turn', () => {
      expect(selectNextQuestionStyle(['explanation'], 'comparison')).toBe('comparison');
    });

    it('rotates to alternative if preferred style was just used', () => {
      const nextStyle = selectNextQuestionStyle(['explanation', 'comparison'], 'comparison');
      expect(nextStyle).not.toBe('comparison');
    });
  });

  describe('Deterministic Fallback Question Templates', () => {
    it('generates grounded fallback questions for all 6 styles with expected key points', () => {
      for (const style of QUESTION_STYLES) {
        const question = generateFallbackQuestionTemplate(mockConcept, style, mockChunks);
        expect(question.conceptId).toBe(mockConcept.id);
        expect(question.questionStyle).toBe(style);
        expect(question.prompt).toContain('Photosynthesis');
        expect(question.expectedKeyPoints.length).toBeGreaterThanOrEqual(2);
        expect(question.sourceChunkIds).toEqual(['chunk-1', 'chunk-2']);
      }
    });
  });

  describe('getOrGenerateRecallQuestion Orchestration', () => {
    it('falls back to deterministic template when fetchGenerateQuestion fails', async () => {
      vi.spyOn(aiClient, 'fetchGenerateQuestion').mockRejectedValueOnce(
        new Error('Network error or rate limited'),
      );

      const result = await getOrGenerateRecallQuestion({
        concept: mockConcept,
        sourceChunks: mockChunks,
        difficultyLevel: 3,
        dbName: 'test-question-fallback-db',
      });

      expect(result.isFallback).toBe(true);
      expect(result.question.prompt).toContain('Photosynthesis');
      expect(result.question.difficulty).toBe(2);
    });

    it('uses Gemini-generated question when API call succeeds and question is not duplicate', async () => {
      vi.spyOn(aiClient, 'fetchGenerateQuestion').mockResolvedValueOnce({
        prompt: 'In detail, contrast the ATP production mechanism in thylakoids with mitochondrial ATP synthesis.',
        style: 'comparison',
        expectedKeyPoints: ['Proton gradient across thylakoid', 'ATP synthase rotor mechanism'],
        sourceChunkIds: ['chunk-1'],
      });

      const result = await getOrGenerateRecallQuestion({
        concept: mockConcept,
        sourceChunks: mockChunks,
        difficultyLevel: 4,
        dbName: 'test-question-ai-db',
      });

      expect(result.isFallback).toBe(false);
      expect(result.question.prompt).toContain('contrast the ATP production');
      expect(result.question.questionStyle).toBe('comparison');
      expect(result.question.difficulty).toBe(4);
      expect(result.question.sourceChunkIds).toEqual(['chunk-1']);
    });
  });
});
