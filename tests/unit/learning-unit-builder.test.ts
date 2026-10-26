import { describe, it, expect } from 'vitest';
import {
  buildLearningUnits,
  assertUnitsComplete,
} from '@/features/learning-units/builder';
import {
  type ConceptRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
} from '@/types/domain';

describe('Learning Unit Builder (Phase R2)', () => {
  const createConcept = (id: string, title: string, order: number): ConceptRecord => ({
    id,
    materialId: 'mat-1',
    title,
    summary: `Summary explaining ${title} in detail.`,
    canonicalExplanation: `Canonical explanation for ${title}.`,
    keyTerms: [title.toLowerCase()],
    sourceChunkIds: [`chunk-${order}`],
    tier: order < 2 ? 0 : 1,
    status: 'available',
    confidence: 0.9,
    extractionOrder: order,
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
  });

  const createChunk = (id: string, index: number): DocumentChunkRecord => ({
    id,
    documentId: 'mat-1',
    materialId: 'mat-1',
    chunkIndex: index,
    text: `Content for chunk ${index}.`,
    startOffset: index * 100,
    endOffset: (index + 1) * 100,
    contentHash: `hash-chunk-${index}`,
    createdAt: '2026-10-25T10:00:00.000Z',
  });

  describe('Single-Unit Fallback', () => {
    it('creates exactly one unit when concepts count is <= 3', () => {
      const concepts = [
        createConcept('c1', 'Process Creation', 0),
        createConcept('c2', 'Process States', 1),
      ];
      const chunks = [createChunk('chunk-0', 0), createChunk('chunk-1', 1)];

      const result = buildLearningUnits({
        materialId: 'mat-1',
        contentVersion: 'v-100',
        concepts,
        dependencies: [],
        chunks,
        docTitle: 'Lecture 1.pdf',
      });

      expect(result.units.length).toBe(1);
      const unit = result.units[0];
      expect(unit.materialId).toBe('mat-1');
      expect(unit.order).toBe(0);
      expect(unit.conceptIds).toEqual(['c1', 'c2']);
      expect(unit.title).toBe('Process Creation');
      expect(unit.summary).toContain('Summary explaining Process Creation');
      expect(result.conceptUnitMap.get('c1')).toBe(unit.id);
      expect(result.conceptUnitMap.get('c2')).toBe(unit.id);

      // Verify invariant: every concept belongs to exactly one unit
      expect(() => assertUnitsComplete(concepts, result.units)).not.toThrow();
    });
  });

  describe('Clustering & Invariants (3-8 concepts)', () => {
    it('clusters 10 concepts deterministically into units of 3-8 concepts', () => {
      const concepts = Array.from({ length: 10 }, (_, i) =>
        createConcept(`c-${i}`, `Concept Topic ${i + 1}`, i),
      );
      const chunks = Array.from({ length: 10 }, (_, i) => createChunk(`chunk-${i}`, i));

      // Add a prerequisite: c-0 -> c-1 -> c-2
      const dependencies: ConceptDependencyRecord[] = [
        {
          id: 'dep-1',
          prerequisiteId: 'c-0',
          dependentConceptId: 'c-1',
          confidence: 0.9,
          removed: false,
          createdAt: '2026-10-25T10:00:00.000Z',
        },
        {
          id: 'dep-2',
          prerequisiteId: 'c-1',
          dependentConceptId: 'c-2',
          confidence: 0.85,
          removed: false,
          createdAt: '2026-10-25T10:00:00.000Z',
        },
      ];

      const result = buildLearningUnits({
        materialId: 'mat-1',
        contentVersion: 'v-200',
        concepts,
        dependencies,
        chunks,
      });

      // Verify units size constraints
      expect(result.units.length).toBeGreaterThanOrEqual(2);
      for (const unit of result.units) {
        expect(unit.conceptIds.length).toBeGreaterThanOrEqual(3);
        expect(unit.conceptIds.length).toBeLessThanOrEqual(8);
      }

      // Verify invariant: every concept belongs to exactly one unit
      expect(() => assertUnitsComplete(concepts, result.units)).not.toThrow();

      // Verify total concepts partition
      const allUnitConcepts = result.units.flatMap((u) => u.conceptIds);
      expect(allUnitConcepts.length).toBe(10);
      expect(new Set(allUnitConcepts).size).toBe(10);
    });

    it('respects topological prerequisite ordering across units', () => {
      const concepts = [
        createConcept('c-math', 'Set Theory', 0),
        createConcept('c-logic', 'Propositional Logic', 1),
        createConcept('c-proof', 'Inductive Proofs', 2),
        createConcept('c-alg1', 'Sorting Algorithms', 3),
        createConcept('c-alg2', 'Graph Algorithms', 4),
        createConcept('c-alg3', 'Dynamic Programming', 5),
      ];
      const chunks = concepts.map((_, i) => createChunk(`chunk-${i}`, i));

      const dependencies: ConceptDependencyRecord[] = [
        {
          id: 'dep-math-proof',
          prerequisiteId: 'c-math',
          dependentConceptId: 'c-proof',
          confidence: 0.9,
          removed: false,
          createdAt: '2026-10-25T10:00:00.000Z',
        },
      ];

      const result = buildLearningUnits(
        {
          materialId: 'mat-1',
          contentVersion: 'v-300',
          concepts,
          dependencies,
          chunks,
        },
        { minConcepts: 3, maxConcepts: 4 },
      );

      expect(result.units.length).toBe(2);
      expect(() => assertUnitsComplete(concepts, result.units)).not.toThrow();

      // Prerequisite c-math should appear in Unit 0 before or with dependent c-proof
      const unit0 = result.units[0];
      expect(unit0.conceptIds).toContain('c-math');
    });

    it('throws error when a concept is omitted from units', () => {
      const concepts = [
        createConcept('c1', 'Topic 1', 0),
        createConcept('c2', 'Topic 2', 1),
      ];
      const incompleteUnits = [
        {
          id: 'u-1',
          materialId: 'mat-1',
          order: 0,
          title: 'Unit 1',
          summary: 'Summary',
          conceptIds: ['c1'], // c2 missing!
          sourceChunkIds: ['chunk-0'],
          contentVersion: 'v-1',
          createdAt: '2026-10-25T10:00:00.000Z',
          updatedAt: '2026-10-25T10:00:00.000Z',
        },
      ];

      expect(() => assertUnitsComplete(concepts, incompleteUnits)).toThrow(
        /Missing concepts: c2/,
      );
    });
  });

  describe('Deterministic Title and Summary', () => {
    it('derives real fallback titles from first concept without lorem ipsum or fabricated concepts', () => {
      const concepts = [
        createConcept('c1', 'Asymmetric Cryptography', 0),
        createConcept('c2', 'RSA Algorithm', 1),
        createConcept('c3', 'Elliptic Curve Diffie-Hellman', 2),
      ];
      const chunks = concepts.map((_, i) => createChunk(`chunk-${i}`, i));

      const result = buildLearningUnits({
        materialId: 'mat-1',
        contentVersion: 'v-crypto',
        concepts,
        dependencies: [],
        chunks,
      });

      const unit = result.units[0];
      expect(unit.title).toBe('Asymmetric Cryptography');
      expect(unit.summary).not.toContain('Lorem ipsum');
      expect(unit.summary).toContain('Asymmetric Cryptography');
    });
  });
});
