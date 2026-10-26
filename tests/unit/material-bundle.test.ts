import { describe, it, expect, beforeEach } from 'vitest';
import { getMaterialBundle } from '@/features/learning-units/material-bundle';
import { createMemoryRepositories } from '@/lib/db/repositories/memory-repositories';
import { type StorageRepositories } from '@/lib/db/repositories/types';
import {
  type DocumentRecord,
  type DocumentChunkRecord,
  type ConceptRecord,
  type LearningUnitRecord,
  type SpacedRepetitionStateRecord,
} from '@/types/domain';

describe('Material Bundle Resolution (Phase R2)', () => {
  let repos: StorageRepositories;
  const materialId = 'mat-bundle-123';

  beforeEach(async () => {
    repos = createMemoryRepositories();

    // 1. Saved document record (WITHOUT any raw Blob in materialFiles)
    const doc: DocumentRecord = {
      id: materialId,
      materialId,
      filename: 'CompilerDesign.pdf',
      fileType: 'pdf',
      fileSize: 204800,
      extractedText: 'Lexical analysis and parsing techniques.',
      analysisStatus: 'completed',
      fileHash: 'sha-compiler-1',
      contentHash: 'content-compiler-1',
      contentVersion: 'content-compiler-1',
      metadata: {},
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
    };
    await repos.documents.put(doc);

    // 2. Chunks
    const chunk1: DocumentChunkRecord = {
      id: 'chk-lex',
      documentId: materialId,
      materialId,
      chunkIndex: 0,
      text: 'Lexical analysis converts characters into tokens.',
      startOffset: 0,
      endOffset: 50,
      contentHash: 'hash-lex',
      createdAt: '2026-10-25T10:00:00.000Z',
    };
    const chunk2: DocumentChunkRecord = {
      id: 'chk-parse',
      documentId: materialId,
      materialId,
      chunkIndex: 1,
      text: 'Parsing constructs an abstract syntax tree.',
      startOffset: 51,
      endOffset: 100,
      contentHash: 'hash-parse',
      createdAt: '2026-10-25T10:00:00.000Z',
    };
    await repos.chunks.putMany([chunk1, chunk2]);

    // 3. Concepts
    const c1: ConceptRecord = {
      id: 'con-lex',
      materialId,
      unitId: 'unit-u1',
      title: 'Lexer & Tokens',
      summary: 'Tokens definition',
      canonicalExplanation: 'Explanation',
      keyTerms: ['token', 'lexer'],
      sourceChunkIds: ['chk-lex'],
      tier: 0,
      status: 'available',
      confidence: 0.95,
      extractionOrder: 0,
      contentVersion: 'content-compiler-1',
      promptVersion: '1.0',
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
    };
    const c2: ConceptRecord = {
      id: 'con-parse',
      materialId,
      unitId: 'unit-u2',
      title: 'Parser & AST',
      summary: 'AST definition',
      canonicalExplanation: 'Explanation',
      keyTerms: ['ast', 'parser'],
      sourceChunkIds: ['chk-parse'],
      tier: 1,
      status: 'available',
      confidence: 0.9,
      extractionOrder: 1,
      contentVersion: 'content-compiler-1',
      promptVersion: '1.0',
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
    };
    await repos.concepts.putMany([c1, c2]);

    // 4. Learning Units
    const u1: LearningUnitRecord = {
      id: 'unit-u1',
      materialId,
      order: 0,
      title: 'Unit 1: Lexical Analysis',
      summary: 'Introduction to scanning and tokens.',
      conceptIds: ['con-lex'],
      sourceChunkIds: ['chk-lex'],
      contentVersion: 'content-compiler-1',
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
    };
    const u2: LearningUnitRecord = {
      id: 'unit-u2',
      materialId,
      order: 1,
      title: 'Unit 2: Syntax Analysis',
      summary: 'Grammars and parsing.',
      conceptIds: ['con-parse'],
      sourceChunkIds: ['chk-parse'],
      contentVersion: 'content-compiler-1',
      createdAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
    };
    await repos.learningUnits.putMany([u1, u2]);

    // 5. SM-2 State
    const sm2: SpacedRepetitionStateRecord = {
      id: 'sr-con-lex',
      conceptId: 'con-lex',
      repetitions: 2,
      easinessFactor: 2.5,
      intervalDays: 3,
      nextDueAt: '2026-10-28T10:00:00.000Z',
      lastReviewedAt: '2026-10-25T10:00:00.000Z',
      weak: false,
      updatedAt: '2026-10-25T10:00:00.000Z',
    };
    await repos.spacedRepetition.put(sm2);
  });

  it('resolves full material bundle for ALL units without requiring raw file blob in storage', async () => {
    // Confirm raw blob is ABSENT from materialFiles store
    const fileBlob = await repos.materialFiles.get(materialId);
    expect(fileBlob).toBeNull();

    const bundle = await getMaterialBundle(materialId, 'ALL', repos);

    expect(bundle.material.id).toBe(materialId);
    expect(bundle.material.filename).toBe('CompilerDesign.pdf');
    expect(bundle.units.length).toBe(2);
    expect(bundle.concepts.length).toBe(2);
    expect(bundle.chunks.length).toBe(2);
    expect(bundle.material.contentVersion).toBe('content-compiler-1');

    // SM-2 states contains con-lex
    const sm2 = bundle.spacedRepetitionStates.find((s) => s.conceptId === 'con-lex');
    expect(sm2).toBeDefined();
    expect(sm2?.intervalDays).toBe(3);
  });

  it('filters material bundle by a specific unit subset', async () => {
    const bundle = await getMaterialBundle(materialId, ['unit-u1'], repos);

    expect(bundle.units.length).toBe(1);
    expect(bundle.units[0].id).toBe('unit-u1');
    expect(bundle.concepts.length).toBe(1);
    expect(bundle.concepts[0].id).toBe('con-lex');
    expect(bundle.chunks.length).toBe(1);
    expect(bundle.chunks[0].id).toBe('chk-lex');
  });

  it('throws an error if the materialId does not exist', async () => {
    await expect(getMaterialBundle('non-existent-id', 'ALL', repos)).rejects.toThrow(
      /was not found in local library/,
    );
  });
});
