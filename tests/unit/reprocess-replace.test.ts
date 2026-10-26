import { describe, it, expect, beforeEach } from 'vitest';
import {
  matchConceptsForReplace,
  planReplaceMaterialConcepts,
  getDeleteMaterialCascadeSummary,
  executeDeleteMaterialCascade,
} from '@/features/learning-units/reprocess-replace';
import { createMemoryRepositories } from '@/lib/db/repositories/memory-repositories';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import {
  type ConceptRecord,
  type DocumentRecord,
  type DocumentChunkRecord,
  type LearningUnitRecord,
  type RecallQuestionRecord,
  type RecallAttemptRecord,
} from '@/types/domain';

describe('Reprocess, Replace & Cascade Delete (Phase R2)', () => {
  let repos: StorageRepositories;

  beforeEach(() => {
    repos = createMemoryRepositories();
  });

  const createConcept = (
    id: string,
    title: string,
    terms: string[],
    archived = false,
  ): ConceptRecord => ({
    id,
    materialId: 'mat-alpha',
    title,
    summary: `Summary of ${title}`,
    canonicalExplanation: `Explanation of ${title}`,
    keyTerms: terms,
    sourceChunkIds: ['ch-1'],
    tier: 1,
    status: 'available',
    confidence: 0.95,
    extractionOrder: 0,
    contentVersion: 'v-100',
    promptVersion: '1.0',
    archived,
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
  });

  describe('Conservative Concept Matching on Replace', () => {
    it('matches concepts with exact normalized titles', () => {
      const oldConcepts = [
        createConcept('c-old-1', 'CPU Scheduling Algorithms', ['cpu', 'scheduling', 'fcfs', 'sjf']),
        createConcept('c-old-2', 'Memory Paging', ['memory', 'paging', 'mmu', 'tlb']),
      ];

      const newConcepts = [
        createConcept('c-new-1', 'cpu scheduling algorithms', ['cpu', 'scheduling', 'rr']), // lowercase match
        createConcept('c-new-2', 'Virtual Memory Paging', ['virtual', 'memory', 'paging']),
      ];

      const match = matchConceptsForReplace(oldConcepts, newConcepts);

      expect(match.matchedPairs.length).toBe(1);
      expect(match.matchedPairs[0].oldConcept.id).toBe('c-old-1');
      expect(match.matchedPairs[0].newConcept.id).toBe('c-new-1');
      expect(match.unmatchedOld.map((c) => c.id)).toEqual(['c-old-2']);
      expect(match.unmatchedNew.map((c) => c.id)).toEqual(['c-new-2']);
    });

    it('matches concepts with high term Jaccard similarity (>= 0.6) for title variations', () => {
      const oldConcepts = [
        createConcept('c-old-1', 'Deadlock Detection', ['deadlock', 'graph', 'detection', 'wait-for', 'cycle']),
      ];

      const newConcepts = [
        createConcept('c-new-1', 'Deadlock & Cycle Detection', ['deadlock', 'graph', 'detection', 'cycle']), // 4/5 = 0.8 Jaccard
      ];

      const match = matchConceptsForReplace(oldConcepts, newConcepts);

      expect(match.matchedPairs.length).toBe(1);
      expect(match.matchedPairs[0].oldConcept.id).toBe('c-old-1');
    });

    it('plans replace: preserves old conceptId on matched concepts and archives unmatched old concepts without deleting', () => {
      const oldConcepts = [
        createConcept('c-old-preserve', 'Processes & Threads', ['process', 'thread']),
        createConcept('c-old-archive', 'Obsolete Legacy Concept', ['obsolete', 'legacy']),
      ];

      const newConcepts = [
        createConcept('c-new-matched', 'Processes & Threads', ['process', 'thread']),
        createConcept('c-new-fresh', 'Coroutines & Green Threads', ['coroutine', 'green', 'thread']),
      ];

      const plan = planReplaceMaterialConcepts(oldConcepts, newConcepts, 'v-200');

      expect(plan.preservedConceptCount).toBe(1);
      expect(plan.archivedConceptCount).toBe(1);
      expect(plan.newConceptCount).toBe(1);

      // Verify matched concept adopted old ID
      const preserved = plan.conceptsToPut.find((c) => c.id === 'c-old-preserve');
      expect(preserved).toBeDefined();
      expect(preserved?.contentVersion).toBe('v-200');
      expect(preserved?.archived).toBe(false);

      // Verify unmatched old concept is archived, NOT deleted
      const archived = plan.conceptsToPut.find((c) => c.id === 'c-old-archive');
      expect(archived).toBeDefined();
      expect(archived?.archived).toBe(true);

      // Verify brand new concept has new ID
      const fresh = plan.conceptsToPut.find((c) => c.id === 'c-new-fresh');
      expect(fresh).toBeDefined();
      expect(fresh?.contentVersion).toBe('v-200');
    });
  });

  describe('Delete Material Cascade and Summary', () => {
    beforeEach(async () => {
      const doc: DocumentRecord = {
        id: 'mat-cascade-1',
        materialId: 'mat-cascade-1',
        filename: 'OperatingSystems.pdf',
        fileType: 'pdf',
        fileSize: 1048576,
        extractedText: 'Content...',
        analysisStatus: 'completed',
        fileHash: 'f-hash-1',
        contentHash: 'c-hash-1',
        contentVersion: 'c-hash-1',
        metadata: {},
        createdAt: '2026-10-25T10:00:00.000Z',
        updatedAt: '2026-10-25T10:00:00.000Z',
      };
      await repos.documents.put(doc);

      const chunk: DocumentChunkRecord = {
        id: 'chk-1',
        documentId: 'mat-cascade-1',
        materialId: 'mat-cascade-1',
        chunkIndex: 0,
        text: 'Chunk text',
        startOffset: 0,
        endOffset: 10,
        contentHash: 'hash-chunk-1',
        createdAt: '2026-10-25T10:00:00.000Z',
      };
      await repos.chunks.put(chunk);

      const concept = createConcept('con-1', 'OS Kernel', ['kernel']);
      concept.materialId = 'mat-cascade-1';
      await repos.concepts.put(concept);

      const unit: LearningUnitRecord = {
        id: 'unit-1',
        materialId: 'mat-cascade-1',
        order: 0,
        title: 'Kernel Architecture',
        summary: 'Unit summary',
        conceptIds: ['con-1'],
        sourceChunkIds: ['chk-1'],
        contentVersion: 'c-hash-1',
        createdAt: '2026-10-25T10:00:00.000Z',
        updatedAt: '2026-10-25T10:00:00.000Z',
      };
      await repos.learningUnits.put(unit);

      const question: RecallQuestionRecord = {
        id: 'q-1',
        conceptId: 'con-1',
        materialId: 'mat-cascade-1',
        unitId: 'unit-1',
        prompt: 'What is the role of an OS kernel?',
        questionStyle: 'explanation',
        referencePoints: ['Kernel abstraction'],
        expectedKeyPoints: ['abstraction', 'resource management'],
        sourceChunkIds: ['chk-1'],
        difficulty: 3,
        contentVersion: 'c-hash-1',
        promptVersion: '1.0',
        createdAt: '2026-10-25T10:00:00.000Z',
      };
      await repos.questions.put(question);

      const attempt: RecallAttemptRecord = {
        id: 'att-1',
        sessionId: 'sess-1',
        questionId: 'q-1',
        conceptId: 'con-1',
        materialId: 'mat-cascade-1',
        unitId: 'unit-1',
        answerText: 'It manages hardware',
        confidence: 2,
        qualityGrade: 4,
        evaluationMode: 'hybrid',
        pendingEvaluation: false,
        createdAt: '2026-10-25T10:05:00.000Z',
      };
      await repos.attempts.put(attempt);
    });

    it('calculates accurate cascade deletion summary naming what will be removed', async () => {
      const summary = await getDeleteMaterialCascadeSummary('mat-cascade-1', repos);

      expect(summary).not.toBeNull();
      expect(summary?.materialId).toBe('mat-cascade-1');
      expect(summary?.materialFilename).toBe('OperatingSystems.pdf');
      expect(summary?.chunkCount).toBe(1);
      expect(summary?.conceptCount).toBe(1);
      expect(summary?.unitCount).toBe(1);
      expect(summary?.questionCount).toBe(1);
      expect(summary?.attemptCount).toBe(1);
      expect(summary?.description).toContain('OperatingSystems.pdf');
    });

    it('executes delete cascade completely across all stores without leaving orphaned records', async () => {
      await executeDeleteMaterialCascade('mat-cascade-1', repos);

      // Verify everything is deleted
      expect(await repos.documents.get('mat-cascade-1')).toBeNull();
      expect(await repos.chunks.get('chk-1')).toBeNull();
      expect(await repos.concepts.get('con-1')).toBeNull();
      expect(await repos.learningUnits.get('unit-1')).toBeNull();
      expect(await repos.questions.get('q-1')).toBeNull();
      expect(await repos.attempts.get('att-1')).toBeNull();
    });
  });
});
