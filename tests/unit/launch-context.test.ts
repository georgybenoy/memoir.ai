import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryRepositories } from '@/lib/db/repositories/memory-repositories';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import { validateLaunchContext, persistWorkflowPreference } from '@/features/workflow/launch-context';
import { type DocumentRecord, type LearningUnitRecord } from '@/types/domain';

describe('Workflow Launch Context Contract (Phase R3)', () => {
  let repos: StorageRepositories;

  const mockMaterial: DocumentRecord = {
    id: 'mat-101',
    materialId: 'mat-101',
    filename: 'Algorithms_Ch1.pdf',
    fileType: 'pdf',
    fileSize: 1024,
    extractedText: 'Algorithm complexity analysis notes.',
    analysisStatus: 'completed',
    contentHash: 'hash-mat-101',
    fileHash: 'fhash-mat-101',
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
  };

  const mockUnit1: LearningUnitRecord = {
    id: 'unit-1',
    materialId: 'mat-101',
    order: 0,
    title: 'Asymptotic Notation',
    summary: 'Big-O, Omega, and Theta notation definitions.',
    conceptIds: ['c1', 'c2'],
    sourceChunkIds: ['ch-1'],
    contentVersion: 'hash-mat-101',
    createdAt: '2026-10-25T10:05:00.000Z',
    updatedAt: '2026-10-25T10:05:00.000Z',
  };

  const mockUnitForeign: LearningUnitRecord = {
    id: 'unit-foreign',
    materialId: 'mat-other',
    order: 0,
    title: 'Foreign Material Unit',
    summary: 'Unit belonging to a different material.',
    conceptIds: ['c99'],
    sourceChunkIds: ['ch-99'],
    contentVersion: 'hash-other',
    createdAt: '2026-10-25T10:05:00.000Z',
    updatedAt: '2026-10-25T10:05:00.000Z',
  };

  beforeEach(async () => {
    repos = createMemoryRepositories();
    await repos.documents.put(mockMaterial);
    await repos.learningUnits.put(mockUnit1);
    await repos.learningUnits.put(mockUnitForeign);
  });

  it('validates a valid launch context for the whole material', async () => {
    const result = await validateLaunchContext(
      {
        materialId: 'mat-101',
        selection: { kind: 'WHOLE_MATERIAL' },
        mode: 'study',
      },
      repos,
    );

    expect(result.valid).toBe(true);
    expect(result.context?.materialId).toBe('mat-101');
    expect(result.context?.selection.kind).toBe('WHOLE_MATERIAL');
    expect(result.context?.mode).toBe('study');
  });

  it('validates a valid launch context for specific learning units', async () => {
    const result = await validateLaunchContext(
      {
        materialId: 'mat-101',
        selection: { kind: 'UNITS', unitIds: ['unit-1'] },
        mode: 'recall',
      },
      repos,
    );

    expect(result.valid).toBe(true);
    expect(result.context?.materialId).toBe('mat-101');
    expect(result.context?.selection).toEqual({ kind: 'UNITS', unitIds: ['unit-1'] });
    expect(result.context?.mode).toBe('recall');
  });

  it('rejects candidates that are not objects or null', async () => {
    const res1 = await validateLaunchContext(null, repos);
    expect(res1.valid).toBe(false);
    expect(res1.redirectStep).toBe(1);

    const res2 = await validateLaunchContext('invalid-string', repos);
    expect(res2.valid).toBe(false);
    expect(res2.redirectStep).toBe(1);
  });

  it('rejects when materialId is missing or does not exist in local storage', async () => {
    const res1 = await validateLaunchContext(
      {
        materialId: '',
        selection: { kind: 'WHOLE_MATERIAL' },
        mode: 'study',
      },
      repos,
    );
    expect(res1.valid).toBe(false);
    expect(res1.redirectStep).toBe(1);

    const res2 = await validateLaunchContext(
      {
        materialId: 'mat-non-existent',
        selection: { kind: 'WHOLE_MATERIAL' },
        mode: 'study',
      },
      repos,
    );
    expect(res2.valid).toBe(false);
    expect(res2.redirectStep).toBe(1);
    expect(res2.reason).toContain('was not found in your library');
  });

  it('rejects an invalid learning mode', async () => {
    const result = await validateLaunchContext(
      {
        materialId: 'mat-101',
        selection: { kind: 'WHOLE_MATERIAL' },
        mode: 'cramming' as unknown as 'study',
      },
      repos,
    );
    expect(result.valid).toBe(false);
    expect(result.redirectStep).toBe(3);
    expect(result.reason).toContain('Invalid learning mode');
  });

  it('rejects when unit selection is empty or references units from another material', async () => {
    const emptyRes = await validateLaunchContext(
      {
        materialId: 'mat-101',
        selection: { kind: 'UNITS', unitIds: [] },
        mode: 'study',
      },
      repos,
    );
    expect(emptyRes.valid).toBe(false);
    expect(emptyRes.redirectStep).toBe(2);

    const foreignRes = await validateLaunchContext(
      {
        materialId: 'mat-101',
        selection: { kind: 'UNITS', unitIds: ['unit-foreign'] },
        mode: 'revision',
      },
      repos,
    );
    expect(foreignRes.valid).toBe(false);
    expect(foreignRes.redirectStep).toBe(2);
    expect(foreignRes.reason).toContain('do not belong to material');
  });

  it('persists workflow preference in workflowState store', async () => {
    await persistWorkflowPreference(
      'mat-101',
      { kind: 'UNITS', unitIds: ['unit-1'] },
      'recall',
      'sess-999',
      repos,
    );

    const stored = await repos.workflowState.getByMaterial('mat-101');
    expect(stored).not.toBeNull();
    expect(stored?.materialId).toBe('mat-101');
    expect(stored?.selection).toEqual({ kind: 'UNITS', unitIds: ['unit-1'] });
    expect(stored?.lastChosenMode).toBe('recall');
    expect(stored?.lastSessionId).toBe('sess-999');
  });
});
