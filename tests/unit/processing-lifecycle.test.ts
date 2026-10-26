import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processMaterialLifecycle,
} from '@/features/ingestion/processing-service';
import { createMemoryRepositories } from '@/lib/db/repositories/memory-repositories';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import * as aiClient from '@/lib/ai/client';

describe('Processing Lifecycle State Machine (Phase R2)', () => {
  let repos: StorageRepositories;
  const encoder = new TextEncoder();

  beforeEach(() => {
    repos = createMemoryRepositories();
    vi.restoreAllMocks();
  });

  const createMockFile = (name = 'Lecture_Operating_Systems.txt', content = 'Introduction to Operating Systems. Process scheduling and memory management.') => {
    const bytes = encoder.encode(content);
    return {
      name,
      size: bytes.byteLength,
      type: 'text/plain',
      lastModified: 1729000000,
      arrayBuffer: async () => bytes.buffer as ArrayBuffer,
    };
  };

  it('runs complete lifecycle: SELECTED -> VALIDATED -> EXTRACTED -> PREVIEWED -> SAVED -> ANALYZING -> UNITS_BUILT -> COMPLETE', async () => {
    const file = createMockFile();
    const stagesSeen: string[] = [];

    // Mock Gemini API route response
    vi.spyOn(aiClient, 'fetchExtractConcepts').mockResolvedValue({
      concepts: [
        {
          tempId: 'temp-c1',
          title: 'Process Scheduling',
          summary: 'Determining CPU allocation for threads.',
          canonicalExplanation: 'OS kernel mechanism for multi-tasking.',
          keyTerms: ['scheduling', 'cpu', 'quantum'],
          prerequisiteTitles: [],
          sourceChunkIds: [],
          confidence: 0.95,
        },
        {
          tempId: 'temp-c2',
          title: 'Context Switching',
          summary: 'Saving and restoring register state.',
          canonicalExplanation: 'Low level dispatch mechanism.',
          keyTerms: ['context', 'registers', 'pcb'],
          prerequisiteTitles: ['Process Scheduling'],
          sourceChunkIds: [],
          confidence: 0.9,
        },
        {
          tempId: 'temp-c3',
          title: 'Memory Paging',
          summary: 'Translating virtual addresses to physical pages.',
          canonicalExplanation: 'Hardware assisted virtual memory.',
          keyTerms: ['paging', 'tlb', 'mmu'],
          prerequisiteTitles: [],
          sourceChunkIds: [],
          confidence: 0.88,
        },
      ],
    });

    const result = await processMaterialLifecycle({
      file,
      customRepos: repos,
      onProgress: (p) => {
        stagesSeen.push(p.stage);
      },
    });

    expect(result.success).toBe(true);
    expect(result.record.stage).toBe('COMPLETE');
    expect(result.record.counts?.totalChunks).toBeGreaterThanOrEqual(1);
    expect(result.record.counts?.extractedConcepts).toBe(3);
    expect(result.record.counts?.totalUnits).toBeGreaterThanOrEqual(1);

    // Verify stages traversed
    expect(stagesSeen).toContain('SELECTED');
    expect(stagesSeen).toContain('VALIDATED');
    expect(stagesSeen).toContain('EXTRACTED');
    expect(stagesSeen).toContain('PREVIEWED');
    expect(stagesSeen).toContain('SAVED');
    expect(stagesSeen).toContain('ANALYZING');
    expect(stagesSeen).toContain('UNITS_BUILT');
    expect(stagesSeen).toContain('COMPLETE');

    // Confirm persisted documents, chunks, concepts, and units
    const doc = await repos.documents.get(result.materialId);
    expect(doc).toBeDefined();
    expect(doc?.analysisStatus).toBe('completed');

    const units = await repos.learningUnits.listByMaterial(result.materialId);
    expect(units.length).toBeGreaterThanOrEqual(1);

    const concepts = await repos.concepts.listByMaterial(result.materialId);
    expect(concepts.length).toBe(3);
  });

  it('Gemini failure at ANALYZING preserves saved source text and chunks, and leaves material in retryable FAILED stage', async () => {
    const file = createMockFile();

    // Mock Gemini API route failure
    vi.spyOn(aiClient, 'fetchExtractConcepts').mockRejectedValue(
      new Error('Gemini quota rate limit exceeded (HTTP 429) on note text: "secret notes"'),
    );

    const result = await processMaterialLifecycle({
      file,
      customRepos: repos,
    });

    expect(result.success).toBe(false);
    expect(result.record.stage).toBe('FAILED');
    expect(result.record.failedStage).toBe('ANALYZING');
    expect(result.record.retryable).toBe(true);

    // Verify note text is NOT leaked in error message (sanitized)
    expect(result.record.errorMessage).not.toContain('"secret notes"');
    expect(result.record.errorMessage).toContain('"[content]"');

    // Source document and chunks must be safely saved in database
    const doc = await repos.documents.get(result.materialId);
    expect(doc).toBeDefined();
    expect(doc?.extractedText).toContain('Process scheduling');

    const chunks = await repos.chunks.listByMaterial(result.materialId);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('resumes idempotently from saved checkpoint and skips already analyzed batches', async () => {
    // Generate enough content to create multiple batches (batch size is default 4 chunks)
    const longContent = Array.from(
      { length: 20 },
      (_, i) => `Topic ${i + 1}: In-depth technical analysis of operating system design, kernel architecture, scheduling algorithms, and synchronization primitives in concurrent execution environments.`,
    ).join('\n\n');
    const file = createMockFile('MultiBatchNotes.txt', longContent);
    const materialId = 'mat-checkpoint-resume';

    // 1. First run: Simulate failure on second batch
    let callCount = 0;
    vi.spyOn(aiClient, 'fetchExtractConcepts').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          concepts: [
            {
              tempId: 'temp-batch1',
              title: 'Batch 1 Concept',
              summary: 'Summary 1',
              canonicalExplanation: 'Exp 1',
              keyTerms: ['term1'],
              prerequisiteTitles: [],
              sourceChunkIds: [],
              confidence: 0.9,
            },
          ],
        };
      }
      throw new Error('Network timeout during batch 2');
    });

    const chunkOptions = { targetSize: 50, minSize: 20, overlap: 0 };

    // Run first attempt
    const firstResult = await processMaterialLifecycle({
      file,
      materialId,
      chunkOptions,
      customRepos: repos,
    });
    expect(firstResult.success).toBe(false);

    // Verify first batch was checkpointed
    const procAfterFirst = await repos.processing.get(materialId);
    expect(procAfterFirst?.analyzedBatchIndices).toContain(0);

    // 2. Second run: Resume
    // Mock succeeds for all calls now
    vi.spyOn(aiClient, 'fetchExtractConcepts').mockResolvedValue({
      concepts: [
        {
          tempId: 'temp-batch2',
          title: 'Batch 2 Concept',
          summary: 'Summary 2',
          canonicalExplanation: 'Exp 2',
          keyTerms: ['term2'],
          prerequisiteTitles: [],
          sourceChunkIds: [],
          confidence: 0.85,
        },
      ],
    });

    const secondResult = await processMaterialLifecycle({
      file,
      materialId,
      chunkOptions,
      customRepos: repos,
    });

    expect(secondResult.success).toBe(true);
    expect(secondResult.record.stage).toBe('COMPLETE');

    // Ensure concepts from both batches were combined without duplicates
    const finalConcepts = await repos.concepts.listByMaterial(materialId);
    expect(finalConcepts.some((c) => c.title === 'Batch 1 Concept')).toBe(true);
    expect(finalConcepts.some((c) => c.title === 'Batch 2 Concept')).toBe(true);
  });
});
