import { describe, it, expect } from 'vitest';
import {
  getProcessingStatusMessage,
  getStageState,
  calculateOverallProgress,
} from '@/components/workflow/step2-organise-material';
import { type MaterialProcessingRecord } from '@/types/domain';

describe('Step 2 Processing State & Progress Calculation Invariants', () => {
  const createMockProcessing = (
    overrides: Partial<MaterialProcessingRecord> = {}
  ): MaterialProcessingRecord => ({
    id: 'mat-test-1',
    materialId: 'mat-test-1',
    stage: 'ANALYZING',
    progressPercent: 25,
    message: 'Extracting concepts...',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  describe('1. Overall Progress Calculation Invariants', () => {
    it('does NOT jump to 100% at the start of a single-batch document', () => {
      // 1 batch total, batch 1 currently running (0 batches completed)
      const proc = createMockProcessing({
        stage: 'ANALYZING',
        currentBatch: 1,
        totalBatches: 1,
        analyzedBatchIndices: [],
      });

      const progress = calculateOverallProgress('ANALYZING', proc, false);
      expect(progress).toBe(25); // Exactly 25%, NOT 100%!
    });

    it('does NOT jump to 50% at the start of a multi-batch document', () => {
      // 2 batches total, batch 1 currently running (0 batches completed)
      const proc = createMockProcessing({
        stage: 'ANALYZING',
        currentBatch: 1,
        totalBatches: 2,
        analyzedBatchIndices: [],
      });

      const progress = calculateOverallProgress('ANALYZING', proc, false);
      expect(progress).toBe(25); // Stage 1 is done, Stage 2 is at 0 completed batches
    });

    it('advances proportionally as batches complete', () => {
      // Batch 1 completed, Batch 2 running (1 of 2 batches completed)
      const proc = createMockProcessing({
        stage: 'ANALYZING',
        currentBatch: 2,
        totalBatches: 2,
        analyzedBatchIndices: [0],
      });

      const progress = calculateOverallProgress('ANALYZING', proc, false);
      // 25% + (1/2) * 60% = 55%
      expect(progress).toBe(55);
    });

    it('reaches 85% at UNITS_BUILT stage', () => {
      const proc = createMockProcessing({
        stage: 'UNITS_BUILT',
        totalBatches: 2,
        analyzedBatchIndices: [0, 1],
      });

      const progress = calculateOverallProgress('UNITS_BUILT', proc, false);
      expect(progress).toBe(85);
    });

    it('reaches 100% only when stage is COMPLETE', () => {
      const proc = createMockProcessing({
        stage: 'COMPLETE',
        totalBatches: 2,
        analyzedBatchIndices: [0, 1],
      });

      const progress = calculateOverallProgress('COMPLETE', proc, false);
      expect(progress).toBe(100);
    });

    it('preserves completed progress on failure', () => {
      const proc = createMockProcessing({
        stage: 'FAILED',
        failedStage: 'ANALYZING',
        currentBatch: 2,
        totalBatches: 4,
        analyzedBatchIndices: [0], // 1 of 4 batches completed
      });

      const progress = calculateOverallProgress('FAILED', proc, true);
      // 25% + (1/4) * 60% = 40%
      expect(progress).toBe(40);
    });
  });

  describe('2. Pipeline Stage Transitions (done / active / waiting / failed)', () => {
    it('marks INGESTION as done, ANALYZING as active, UNITS_BUILT as waiting during concept extraction', () => {
      expect(getStageState('INGESTION', 'ANALYZING', false)).toBe('done');
      expect(getStageState('ANALYZING', 'ANALYZING', false)).toBe('active');
      expect(getStageState('UNITS_BUILT', 'ANALYZING', false)).toBe('waiting');
    });

    it('marks INGESTION and ANALYZING as done, UNITS_BUILT as active during unit synthesis', () => {
      expect(getStageState('INGESTION', 'UNITS_BUILT', false)).toBe('done');
      expect(getStageState('ANALYZING', 'UNITS_BUILT', false)).toBe('done');
      expect(getStageState('UNITS_BUILT', 'UNITS_BUILT', false)).toBe('active');
    });

    it('marks all stages as done when COMPLETE', () => {
      expect(getStageState('INGESTION', 'COMPLETE', false)).toBe('done');
      expect(getStageState('ANALYZING', 'COMPLETE', false)).toBe('done');
      expect(getStageState('UNITS_BUILT', 'COMPLETE', false)).toBe('done');
    });

    it('correctly attributes failure to the active stage on error', () => {
      expect(getStageState('INGESTION', 'FAILED', true, 'ANALYZING')).toBe('done');
      expect(getStageState('ANALYZING', 'FAILED', true, 'ANALYZING')).toBe('failed');
      expect(getStageState('UNITS_BUILT', 'FAILED', true, 'ANALYZING')).toBe('waiting');
    });
  });

  describe('3. Processing Copy & Status Messages', () => {
    it('returns concise status message during single-batch concept extraction', () => {
      const proc = createMockProcessing({
        stage: 'ANALYZING',
        currentBatch: 1,
        totalBatches: 1,
      });

      expect(getProcessingStatusMessage(proc, false, null)).toBe(
        'Identifying key concepts…'
      );
    });

    it('returns concise batch progress status during multi-batch extraction', () => {
      const proc = createMockProcessing({
        stage: 'ANALYZING',
        currentBatch: 2,
        totalBatches: 3,
      });

      expect(getProcessingStatusMessage(proc, false, null)).toBe(
        'Identifying key concepts (batch 2 of 3)…'
      );
    });

    it('displays rate-limit throttle pacing message when actively waiting', () => {
      const proc = createMockProcessing({
        stage: 'ANALYZING',
        currentBatch: 2,
        totalBatches: 2,
        message: 'Pacing requests to respect Gemini API limits (waiting 8s before batch 2 of 2)...',
      });

      expect(getProcessingStatusMessage(proc, false, null)).toBe(
        'Pacing requests to respect Gemini API limits (waiting 8s before batch 2 of 2)...'
      );
    });

    it('displays concise message for learning units generation', () => {
      const proc = createMockProcessing({ stage: 'UNITS_BUILT' });
      expect(getProcessingStatusMessage(proc, false, null)).toBe(
        'Organising concepts, prerequisites, and learning units…'
      );
    });

    it('displays error message when failed', () => {
      const proc = createMockProcessing({
        stage: 'FAILED',
        errorMessage: 'Gemini AI service is temporarily unavailable. Please retry.',
      });
      expect(getProcessingStatusMessage(proc, true, null)).toBe(
        'Gemini AI service is temporarily unavailable. Please retry.'
      );
    });
  });
});
