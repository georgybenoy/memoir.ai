import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepositories } from '@/lib/db/repositories/memory-repositories';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import { deriveStepForMaterial, validateStepAccess } from '@/features/workflow/step-guard';
import {
  type DocumentRecord,
  type MaterialProcessingRecord,
  type StudySessionRecord,
  type WorkflowStateRecord,
} from '@/types/domain';

describe('Workflow Step Derivation & Guards (Phase R3)', () => {
  let repos: StorageRepositories;

  const mockMaterial: DocumentRecord = {
    id: 'mat-os',
    materialId: 'mat-os',
    filename: 'Operating_Systems.pdf',
    fileType: 'pdf',
    fileSize: 2048,
    extractedText: 'Process synchronization and concurrency.',
    analysisStatus: 'completed',
    contentHash: 'hash-mat-os',
    fileHash: 'fhash-mat-os',
    createdAt: '2026-10-25T11:00:00.000Z',
    updatedAt: '2026-10-25T11:00:00.000Z',
  };

  beforeEach(async () => {
    repos = createMemoryRepositories();
  });

  describe('deriveStepForMaterial', () => {
    it('derives Step 1 when no materialId is provided or material does not exist', async () => {
      const res1 = await deriveStepForMaterial(null, repos);
      expect(res1.step).toBe(1);
      expect(res1.route).toBe('/learn/new');

      const res2 = await deriveStepForMaterial('mat-unknown', repos);
      expect(res2.step).toBe(1);
      expect(res2.route).toBe('/learn/new');
    });

    it('derives Step 2 when material exists but processing is not COMPLETE', async () => {
      await repos.documents.put(mockMaterial);

      // In progress
      const inProgressProc: MaterialProcessingRecord = {
        id: 'mat-os',
        materialId: 'mat-os',
        stage: 'ANALYZING',
        progressPercent: 50,
        message: 'Analyzing batch 1 of 2...',
        contentVersion: 'hash-mat-os',
        promptVersion: '1.0',
        createdAt: '2026-10-25T11:00:00.000Z',
        updatedAt: '2026-10-25T11:01:00.000Z',
      };
      await repos.processing.put(inProgressProc);

      const res = await deriveStepForMaterial('mat-os', repos);
      expect(res.step).toBe(2);
      expect(res.route).toBe('/learn/mat-os/organise');

      // Failed processing
      const failedProc: MaterialProcessingRecord = {
        ...inProgressProc,
        stage: 'FAILED',
        failedStage: 'ANALYZING',
        errorMessage: 'Quota exhausted',
        retryable: true,
      };
      await repos.processing.put(failedProc);

      const resFailed = await deriveStepForMaterial('mat-os', repos);
      expect(resFailed.step).toBe(2);
      expect(resFailed.route).toBe('/learn/mat-os/organise');
      expect(resFailed.reason).toContain('Analysis failed');
    });

    it('derives Step 3 when material processing is COMPLETE and no active session exists', async () => {
      await repos.documents.put(mockMaterial);
      await repos.processing.put({
        id: 'mat-os',
        materialId: 'mat-os',
        stage: 'COMPLETE',
        progressPercent: 100,
        message: 'Completed processing: 2 units ready.',
        contentVersion: 'hash-mat-os',
        promptVersion: '1.0',
        createdAt: '2026-10-25T11:00:00.000Z',
        updatedAt: '2026-10-25T11:02:00.000Z',
      });

      const res = await deriveStepForMaterial('mat-os', repos);
      expect(res.step).toBe(3);
      expect(res.route).toBe('/learn/mat-os/mode');
    });

    it('derives Step 4 when material is COMPLETE and an active session is in progress', async () => {
      await repos.documents.put(mockMaterial);
      await repos.processing.put({
        id: 'mat-os',
        materialId: 'mat-os',
        stage: 'COMPLETE',
        progressPercent: 100,
        message: 'Completed processing.',
        contentVersion: 'hash-mat-os',
        promptVersion: '1.0',
        createdAt: '2026-10-25T11:00:00.000Z',
        updatedAt: '2026-10-25T11:02:00.000Z',
      });

      const activeSession: StudySessionRecord = {
        id: 'sess-active-1',
        materialId: 'mat-os',
        currentConceptId: 'c1',
        machineState: 'IDLE',
        sourceMode: 'document',
        startedAt: '2026-10-25T11:05:00.000Z',
        updatedAt: '2026-10-25T11:10:00.000Z',
      };
      await repos.sessions.put(activeSession);

      const wfState: WorkflowStateRecord = {
        id: 'mat-os',
        materialId: 'mat-os',
        selection: { kind: 'WHOLE_MATERIAL' },
        lastChosenMode: 'study',
        lastSessionId: 'sess-active-1',
        updatedAt: '2026-10-25T11:10:00.000Z',
      };
      await repos.workflowState.put(wfState);

      const res = await deriveStepForMaterial('mat-os', repos);
      expect(res.step).toBe(4);
      expect(res.sessionId).toBe('sess-active-1');
      expect(res.route).toBe('/learn/mat-os/session/sess-active-1');
    });
  });

  describe('validateStepAccess', () => {
    it('always allows access to Step 1', async () => {
      const res = await validateStepAccess(null, 1, repos);
      expect(res.allowed).toBe(true);
      expect(res.effectiveStep).toBe(1);
      expect(res.effectiveRoute).toBe('/learn/new');
    });

    it('redirects to Step 1 if material does not exist when accessing Step 2, 3, or 4', async () => {
      const resStep2 = await validateStepAccess('non-existent', 2, repos);
      expect(resStep2.allowed).toBe(false);
      expect(resStep2.effectiveStep).toBe(1);
      expect(resStep2.effectiveRoute).toBe('/learn/new');

      const resStep3 = await validateStepAccess('non-existent', 3, repos);
      expect(resStep3.allowed).toBe(false);
      expect(resStep3.effectiveStep).toBe(1);
      expect(resStep3.effectiveRoute).toBe('/learn/new');
    });

    it('redirects to Step 2 if accessing Step 3 while processing is incomplete', async () => {
      await repos.documents.put(mockMaterial);
      await repos.processing.put({
        id: 'mat-os',
        materialId: 'mat-os',
        stage: 'ANALYZING',
        progressPercent: 30,
        message: 'Analyzing...',
        contentVersion: 'hash-mat-os',
        promptVersion: '1.0',
        createdAt: '2026-10-25T11:00:00.000Z',
        updatedAt: '2026-10-25T11:01:00.000Z',
      });

      const res = await validateStepAccess('mat-os', 3, repos);
      expect(res.allowed).toBe(false);
      expect(res.effectiveStep).toBe(2);
      expect(res.effectiveRoute).toBe('/learn/mat-os/organise');
      expect(res.reason).toContain('Analysis must be completed');
    });

    it('redirects to Step 3 if accessing Step 4 without a valid session', async () => {
      await repos.documents.put(mockMaterial);
      await repos.processing.put({
        id: 'mat-os',
        materialId: 'mat-os',
        stage: 'COMPLETE',
        progressPercent: 100,
        message: 'Completed.',
        contentVersion: 'hash-mat-os',
        promptVersion: '1.0',
        createdAt: '2026-10-25T11:00:00.000Z',
        updatedAt: '2026-10-25T11:01:00.000Z',
      });

      // No sessionId passed
      const res1 = await validateStepAccess('mat-os', 4, repos);
      expect(res1.allowed).toBe(false);
      expect(res1.effectiveStep).toBe(3);
      expect(res1.effectiveRoute).toBe('/learn/mat-os/mode');

      // Invalid sessionId passed
      const res2 = await validateStepAccess('mat-os', 4, repos, 'sess-invalid');
      expect(res2.allowed).toBe(false);
      expect(res2.effectiveStep).toBe(3);
      expect(res2.effectiveRoute).toBe('/learn/mat-os/mode');
    });

    it('allows access to Step 4 when material is COMPLETE and session is valid', async () => {
      await repos.documents.put(mockMaterial);
      await repos.processing.put({
        id: 'mat-os',
        materialId: 'mat-os',
        stage: 'COMPLETE',
        progressPercent: 100,
        message: 'Completed.',
        contentVersion: 'hash-mat-os',
        promptVersion: '1.0',
        createdAt: '2026-10-25T11:00:00.000Z',
        updatedAt: '2026-10-25T11:01:00.000Z',
      });

      const session: StudySessionRecord = {
        id: 'sess-valid-1',
        materialId: 'mat-os',
        currentConceptId: 'c1',
        machineState: 'IDLE',
        sourceMode: 'document',
        startedAt: '2026-10-25T11:00:00.000Z',
        updatedAt: '2026-10-25T11:05:00.000Z',
      };
      await repos.sessions.put(session);

      const res = await validateStepAccess('mat-os', 4, repos, 'sess-valid-1');
      expect(res.allowed).toBe(true);
      expect(res.effectiveStep).toBe(4);
      expect(res.effectiveRoute).toBe('/learn/mat-os/session/sess-valid-1');
    });
  });
});
