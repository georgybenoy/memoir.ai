import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processMaterialLifecycle,
  resumeMaterialAnalysis,
  processingJobManager,
} from '@/features/ingestion';
import { createMemoryRepositories } from '@/lib/db/repositories/memory-repositories';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import * as aiClient from '@/lib/ai/client';

describe('Document Processing Pipeline Audit & Resilience Regression Suite', () => {
  let repos: StorageRepositories;
  const encoder = new TextEncoder();

  beforeEach(() => {
    repos = createMemoryRepositories();
    vi.restoreAllMocks();
  });

  const createMockFile = (
    name = 'Network_Protocols.txt',
    content = 'TCP/IP Model. Three-way handshake: SYN, SYN-ACK, ACK. Flow control using sliding window.'
  ) => {
    const bytes = encoder.encode(content);
    return {
      name,
      size: bytes.byteLength,
      type: 'text/plain',
      lastModified: 1729000000,
      arrayBuffer: async () => bytes.buffer as ArrayBuffer,
    };
  };

  const mockAiConcepts = [
    {
      tempId: 'temp-c1',
      title: 'Three-Way Handshake',
      summary: 'Connection establishment in TCP.',
      canonicalExplanation: 'SYN, SYN-ACK, ACK sequence establishing synchronized sequence numbers.',
      keyTerms: ['TCP', 'SYN', 'ACK', 'handshake'],
      prerequisiteTitles: [],
      sourceChunkIds: [],
      confidence: 0.95,
    },
    {
      tempId: 'temp-c2',
      title: 'Sliding Window Protocol',
      summary: 'Flow control mechanism in transport layer.',
      canonicalExplanation: 'Permits sender to transmit multiple packets before receiving acknowledgment.',
      keyTerms: ['window', 'buffer', 'flow control'],
      prerequisiteTitles: ['Three-Way Handshake'],
      sourceChunkIds: [],
      confidence: 0.92,
    },
  ];

  it('Directive 4: Every state transition belongs to a unique runId and records stage outcome', async () => {
    vi.spyOn(aiClient, 'fetchExtractConcepts').mockResolvedValue({
      concepts: mockAiConcepts,
    });

    const runIdsSeen: string[] = [];
    const file = createMockFile();

    const result = await processMaterialLifecycle({
      file,
      customRepos: repos,
      throttleDelayMs: 0,
      onProgress: (p) => {
        if (p.runId) {
          runIdsSeen.push(p.runId);
        }
      },
    });

    expect(result.success).toBe(true);
    expect(result.record.runId).toBeDefined();
    expect(result.record.stage).toBe('COMPLETE');

    // Confirm that every state transition broadcast has the same runId
    expect(runIdsSeen.length).toBeGreaterThan(0);
    const initialRunId = runIdsSeen[0];
    for (const rid of runIdsSeen) {
      expect(rid).toBe(initialRunId);
    }
  });

  it('Directive 4 & 5: Cancellation immediately pauses pipeline, marks CANCELLED, and NEVER reports success', async () => {
    const abortController = new AbortController();

    // Mock AI call that aborts midway
    vi.spyOn(aiClient, 'fetchExtractConcepts').mockImplementation(async () => {
      abortController.abort();
      throw new Error('This operation was aborted');
    });

    const file = createMockFile();
    const result = await processMaterialLifecycle({
      file,
      customRepos: repos,
      signal: abortController.signal,
      throttleDelayMs: 0,
    });

    // Cancellation must NEVER be reported as success
    expect(result.success).toBe(false);
    expect(result.record.stage).toBe('CANCELLED');
    expect(result.record.errorCode).not.toBe('INTERNAL_ERROR');

    // Terminal state in DB must be CANCELLED, not COMPLETE
    const dbRecord = await repos.processing.getByMaterial(result.materialId);
    expect(dbRecord?.stage).toBe('CANCELLED');

    const doc = await repos.documents.get(result.materialId);
    expect(doc?.analysisStatus).not.toBe('completed');
  });

  it('Directive 6: Retrying a failed or paused material preserves checkpoint and produces NO duplicate concepts or learning units', async () => {
    // 1. First run fails during concept extraction
    let callCount = 0;
    vi.spyOn(aiClient, 'fetchExtractConcepts').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Gemini 503 Service Unavailable');
      }
      return { concepts: mockAiConcepts };
    });

    const file = createMockFile();
    const initialResult = await processMaterialLifecycle({
      file,
      customRepos: repos,
      throttleDelayMs: 0,
    });

    expect(initialResult.success).toBe(false);
    expect(initialResult.record.stage).toBe('FAILED');
    expect(initialResult.record.retryable).toBe(true);
    const materialId = initialResult.materialId;

    // 2. Resume / Retry the analysis
    const retryResult = await resumeMaterialAnalysis(materialId, {
      customRepos: repos,
      throttleDelayMs: 0,
    });

    expect(retryResult.success).toBe(true);
    expect(retryResult.record.stage).toBe('COMPLETE');

    // 3. Verify IndexedDB records: exactly 2 concepts and correct units, NO DUPLICATES!
    const concepts = await repos.concepts.listByMaterial(materialId);
    expect(concepts.length).toBe(2);

    const units = await repos.learningUnits.listByMaterial(materialId);
    expect(units.length).toBeGreaterThanOrEqual(1);

    // 4. Retry AGAIN on completed material (reprocess): must still NOT duplicate concepts or units
    const secondReprocess = await resumeMaterialAnalysis(materialId, {
      customRepos: repos,
      throttleDelayMs: 0,
    });
    expect(secondReprocess.success).toBe(true);

    const conceptsAfterReprocess = await repos.concepts.listByMaterial(materialId);
    expect(conceptsAfterReprocess.length).toBe(2);

    const unitsAfterReprocess = await repos.learningUnits.listByMaterial(materialId);
    expect(unitsAfterReprocess.length).toBe(units.length);
  });

  it('Directive 8: ProcessingJobManager prevents duplicate concurrent runs on the same material and isolates different materials', async () => {
    let resolveAi!: (val: { concepts: typeof mockAiConcepts }) => void;
    const aiPromise = new Promise<{ concepts: typeof mockAiConcepts }>((res) => {
      resolveAi = res;
    });

    vi.spyOn(aiClient, 'fetchExtractConcepts').mockImplementation(() => aiPromise);

    const file1 = createMockFile('Material_A.txt', 'Content for material A');
    const file2 = createMockFile('Material_B.txt', 'Content for material B');

    // Launch run for material 1
    const p1 = processMaterialLifecycle({
      file: file1,
      customRepos: repos,
      throttleDelayMs: 0,
    });

    // Wait a tick for job registration
    await new Promise((r) => setTimeout(r, 20));

    // Try launching a concurrent second run for the SAME material
    // Wait for p1 to assign materialId
    const activeJobs = processingJobManager['activeJobs'];
    expect(activeJobs.size).toBe(1);

    const mat1Id = Array.from(activeJobs.keys())[0];
    expect(processingJobManager.hasJob(mat1Id)).toBe(true);

    // Concurrently try to resume material 1 while job is active
    const duplicateP1 = resumeMaterialAnalysis(mat1Id, {
      customRepos: repos,
      throttleDelayMs: 0,
    });

    // Concurrently launch run for DIFFERENT material (material 2)
    const p2 = processMaterialLifecycle({
      file: file2,
      customRepos: repos,
      throttleDelayMs: 0,
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(processingJobManager['activeJobs'].size).toBe(2);

    // Resolve AI for both jobs
    resolveAi({ concepts: mockAiConcepts });

    const [res1, dupRes1, res2] = await Promise.all([p1, duplicateP1, p2]);

    expect(res1.success).toBe(true);
    expect(dupRes1.success).toBe(true);
    expect(res2.success).toBe(true);

    // dupRes1 must share the exact same result and runId as res1
    expect(dupRes1.record.runId).toBe(res1.record.runId);
    expect(res2.record.runId).not.toBe(res1.record.runId);

    // Both jobs auto-cleanup from activeJobs upon completion
    expect(processingJobManager.hasJob(mat1Id)).toBe(false);
    expect(processingJobManager.hasJob(res2.materialId)).toBe(false);
  });
});
