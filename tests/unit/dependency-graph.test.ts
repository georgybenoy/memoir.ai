/**
 * Dependency Graph Unit & Property Tests
 * Tests chains, diamonds, forests, cycles, determinism, property-style random graphs,
 * depth tiers, downstream influence, and linear fallback.
 * Source of truth: PRD FR-04, TECH_STACK §9.1
 */

import { describe, it, expect } from 'vitest';
import {
  buildDependencyGraph,
  validateGraphIntegrity,
  linearFallbackOrder,
  normalizeDependencies,
} from '@/features/dependency-graph';
import {
  type ConceptRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
} from '@/types/domain';

function makeConcept(id: string, extractionOrder: number, title?: string): ConceptRecord {
  return {
    id,
    title: title ?? `Concept ${id}`,
    summary: `Summary of ${id}`,
    canonicalExplanation: `Explanation of ${id}`,
    keyTerms: [id.toLowerCase()],
    sourceChunkIds: [`chunk-${id}`],
    tier: 0,
    status: 'available',
    confidence: 0.95,
    extractionOrder,
    createdAt: '2026-10-22T00:00:00Z',
    updatedAt: '2026-10-22T00:00:00Z',
  };
}

function makeEdge(
  fromId: string,
  toId: string,
  confidence = 0.8,
  id?: string,
): ConceptDependencyRecord {
  return {
    id: id ?? `dep-${fromId}-${toId}`,
    prerequisiteId: fromId,
    dependentConceptId: toId,
    confidence,
    removed: false,
    createdAt: '2026-10-22T00:00:00Z',
  };
}

describe('Dependency Graph Pipeline (Tarjan, Kahn, Tiers, Influence)', () => {
  describe('Input Normalization', () => {
    it('drops self-loops and records removedReason = "self_loop"', () => {
      const concepts = [makeConcept('A', 1), makeConcept('B', 2)];
      const raw = [
        makeEdge('A', 'A', 0.9, 'self-1'),
        makeEdge('A', 'B', 0.8, 'edge-1'),
      ];

      const { validEdges, removedEdges } = normalizeDependencies(concepts, raw);
      expect(validEdges.length).toBe(1);
      expect(validEdges[0].id).toBe('edge-1');
      expect(removedEdges.length).toBe(1);
      expect(removedEdges[0].id).toBe('self-1');
      expect(removedEdges[0].removed).toBe(true);
      expect(removedEdges[0].removedReason).toBe('self_loop');
    });

    it('drops duplicate edges keeping highest confidence and records reason', () => {
      const concepts = [makeConcept('A', 1), makeConcept('B', 2)];
      const raw = [
        makeEdge('A', 'B', 0.4, 'dup-low'),
        makeEdge('A', 'B', 0.9, 'dup-high'),
      ];

      const { validEdges, removedEdges } = normalizeDependencies(concepts, raw);
      expect(validEdges.length).toBe(1);
      expect(validEdges[0].id).toBe('dup-high');
      expect(validEdges[0].confidence).toBe(0.9);

      expect(removedEdges.length).toBe(1);
      expect(removedEdges[0].id).toBe('dup-low');
      expect(removedEdges[0].removedReason).toBe('duplicate_edge');
    });

    it('drops edges referencing unknown concepts and records reasons', () => {
      const concepts = [makeConcept('A', 1)];
      const raw = [
        makeEdge('A', 'UNKNOWN_DEP', 0.8, 'edge-unknown-dep'),
        makeEdge('UNKNOWN_PREREQ', 'A', 0.8, 'edge-unknown-prereq'),
      ];

      const { validEdges, removedEdges } = normalizeDependencies(concepts, raw);
      expect(validEdges.length).toBe(0);
      expect(removedEdges.length).toBe(2);
      expect(removedEdges.some((e) => e.removedReason === 'unknown_dependent')).toBe(true);
      expect(removedEdges.some((e) => e.removedReason === 'unknown_prerequisite')).toBe(true);
    });
  });

  describe('Standard Graph Topologies', () => {
    it('topologically sorts a linear chain (A -> B -> C)', () => {
      const concepts = [makeConcept('C', 3), makeConcept('A', 1), makeConcept('B', 2)];
      const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];

      const result = buildDependencyGraph({ concepts, dependencies: edges });
      expect(result.graphMode).toBe('dag');
      expect(result.orderedConcepts.map((c) => c.id)).toEqual(['A', 'B', 'C']);
      expect(result.tiers.get('A')).toBe(0);
      expect(result.tiers.get('B')).toBe(1);
      expect(result.tiers.get('C')).toBe(2);
    });

    it('topologically sorts a diamond graph (A -> B, A -> C, B -> D, C -> D)', () => {
      const concepts = [
        makeConcept('D', 4),
        makeConcept('C', 3),
        makeConcept('B', 2),
        makeConcept('A', 1),
      ];
      const edges = [
        makeEdge('A', 'B'),
        makeEdge('A', 'C'),
        makeEdge('B', 'D'),
        makeEdge('C', 'D'),
      ];

      const result = buildDependencyGraph({ concepts, dependencies: edges });
      const ids = result.orderedConcepts.map((c) => c.id);

      expect(ids[0]).toBe('A');
      expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));
      expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'));
      expect(ids[3]).toBe('D');

      expect(result.tiers.get('A')).toBe(0);
      expect(result.tiers.get('B')).toBe(1);
      expect(result.tiers.get('C')).toBe(1);
      expect(result.tiers.get('D')).toBe(2);
    });

    it('topologically sorts a forest with multiple disjoint trees', () => {
      // Tree 1: A1 -> B1
      // Tree 2: A2 -> B2
      const concepts = [
        makeConcept('B2', 4),
        makeConcept('A2', 3),
        makeConcept('B1', 2),
        makeConcept('A1', 1),
      ];
      const edges = [makeEdge('A1', 'B1'), makeEdge('A2', 'B2')];

      const result = buildDependencyGraph({ concepts, dependencies: edges });
      const ids = result.orderedConcepts.map((c) => c.id);

      // Stable tie-breaking: extractionOrder 1 (A1) then 3 (A2)
      expect(ids.indexOf('A1')).toBeLessThan(ids.indexOf('B1'));
      expect(ids.indexOf('A2')).toBeLessThan(ids.indexOf('B2'));
      // A1 (order 1) -> B1 (order 2) -> A2 (order 3) -> B2 (order 4)
      expect(ids).toEqual(['A1', 'B1', 'A2', 'B2']);
    });

    it('handles a single isolated node', () => {
      const concepts = [makeConcept('SINGLE', 1)];
      const result = buildDependencyGraph({ concepts, dependencies: [] });

      expect(result.orderedConcepts.length).toBe(1);
      expect(result.orderedConcepts[0].id).toBe('SINGLE');
      expect(result.tiers.get('SINGLE')).toBe(0);
      expect(result.downstreamInfluence.get('SINGLE')).toBe(0);
    });

    it('orders disconnected nodes strictly by extractionOrder', () => {
      const concepts = [
        makeConcept('Z', 50),
        makeConcept('X', 10),
        makeConcept('Y', 25),
      ];
      const result = buildDependencyGraph({ concepts, dependencies: [] });

      expect(result.orderedConcepts.map((c) => c.id)).toEqual(['X', 'Y', 'Z']);
      expect(result.tiers.get('X')).toBe(0);
      expect(result.tiers.get('Y')).toBe(0);
      expect(result.tiers.get('Z')).toBe(0);
    });
  });

  describe('Cycle Detection & Deterministic Tie-Breaking', () => {
    it('resolves a 2-cycle by removing the lower confidence edge (A -> B -> A)', () => {
      const concepts = [makeConcept('A', 1), makeConcept('B', 2)];
      const edges = [
        makeEdge('A', 'B', 0.9, 'edge-AB'),
        makeEdge('B', 'A', 0.4, 'edge-BA'), // lower confidence
      ];

      const result = buildDependencyGraph({ concepts, dependencies: edges });
      expect(result.diagnostics.isAcyclic).toBe(true);
      expect(result.activeEdges.length).toBe(1);
      expect(result.activeEdges[0].id).toBe('edge-AB');

      expect(result.removedEdges.length).toBe(1);
      expect(result.removedEdges[0].id).toBe('edge-BA');
      expect(result.removedEdges[0].removedReason).toBe('cycle_resolution');
    });

    it('breaks cycle tie by keeping dependent concept with lower extractionOrder last', () => {
      // Both edges have equal confidence (0.8)
      // Edge 1: A -> B (dependent B has extractionOrder 2)
      // Edge 2: B -> A (dependent A has extractionOrder 1)
      // Rule: "the dependent concept with lower extractionOrder being kept last"
      // -> Edge leading to A (lower order 1) is kept!
      // -> Edge leading to B (higher order 2) is REMOVED!
      const concepts = [makeConcept('A', 1), makeConcept('B', 2)];
      const edges = [
        makeEdge('A', 'B', 0.8, 'edge-AB'),
        makeEdge('B', 'A', 0.8, 'edge-BA'),
      ];

      const result = buildDependencyGraph({ concepts, dependencies: edges });
      expect(result.diagnostics.isAcyclic).toBe(true);

      // Edge A -> B was removed; Edge B -> A was kept
      expect(result.removedEdges.some((e) => e.id === 'edge-AB')).toBe(true);
      expect(result.activeEdges.some((e) => e.id === 'edge-BA')).toBe(true);

      // Topological order: B comes before A
      expect(result.orderedConcepts.map((c) => c.id)).toEqual(['B', 'A']);
    });

    it('breaks cycle tie lexicographically if both confidence and extractionOrder are equal', () => {
      // Both dependent concepts have same extractionOrder (1)
      // Edge A -> B vs Edge B -> A
      // Lexicographic on (fromId, toId): ('A', 'B') < ('B', 'A')
      // Edge A -> B is selected and removed first
      const concepts = [makeConcept('A', 1), makeConcept('B', 1)];
      const edges = [
        makeEdge('A', 'B', 0.7, 'edge-AB'),
        makeEdge('B', 'A', 0.7, 'edge-BA'),
      ];

      const result = buildDependencyGraph({ concepts, dependencies: edges });
      expect(result.diagnostics.isAcyclic).toBe(true);
      expect(result.removedEdges[0].id).toBe('edge-AB');
      expect(result.activeEdges[0].id).toBe('edge-BA');
    });

    it('resolves a 3-cycle (A -> B -> C -> A)', () => {
      const concepts = [
        makeConcept('A', 1),
        makeConcept('B', 2),
        makeConcept('C', 3),
      ];
      const edges = [
        makeEdge('A', 'B', 0.9),
        makeEdge('B', 'C', 0.9),
        makeEdge('C', 'A', 0.3, 'edge-CA-weak'),
      ];

      const result = buildDependencyGraph({ concepts, dependencies: edges });
      expect(result.diagnostics.isAcyclic).toBe(true);
      expect(result.activeEdges.length).toBe(2);
      expect(result.removedEdges.some((e) => e.id === 'edge-CA-weak')).toBe(true);
      expect(result.orderedConcepts.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });

    it('resolves multiple disjoint SCC cycles', () => {
      // SCC 1: A <-> B
      // SCC 2: C <-> D
      const concepts = [
        makeConcept('A', 1),
        makeConcept('B', 2),
        makeConcept('C', 3),
        makeConcept('D', 4),
      ];
      const edges = [
        makeEdge('A', 'B', 0.9, 'AB'),
        makeEdge('B', 'A', 0.4, 'BA-weak'),
        makeEdge('C', 'D', 0.8, 'CD'),
        makeEdge('D', 'C', 0.2, 'DC-weak'),
      ];

      const result = buildDependencyGraph({ concepts, dependencies: edges });
      expect(result.diagnostics.isAcyclic).toBe(true);
      expect(result.activeEdges.length).toBe(2);
      expect(result.removedEdges.map((e) => e.id)).toEqual(
        expect.arrayContaining(['BA-weak', 'DC-weak']),
      );
    });

    it('resolves nested cycles within a single SCC', () => {
      // Cycle 1: A -> B -> A
      // Cycle 2: B -> C -> B
      // Combined SCC: {A, B, C}
      const concepts = [
        makeConcept('A', 1),
        makeConcept('B', 2),
        makeConcept('C', 3),
      ];
      const edges = [
        makeEdge('A', 'B', 0.9, 'AB'),
        makeEdge('B', 'A', 0.3, 'BA-weak'),
        makeEdge('B', 'C', 0.9, 'BC'),
        makeEdge('C', 'B', 0.4, 'CB-weak'),
      ];

      const result = buildDependencyGraph({ concepts, dependencies: edges });
      expect(result.diagnostics.isAcyclic).toBe(true);
      expect(result.activeEdges.length).toBe(2);
      expect(result.orderedConcepts.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('Determinism & Invariance Across Runs and Edge Shuffles', () => {
    it('produces byte-identical output across runs for identical inputs', () => {
      const concepts = [
        makeConcept('A', 1),
        makeConcept('B', 2),
        makeConcept('C', 3),
        makeConcept('D', 4),
      ];
      const edges = [
        makeEdge('A', 'B', 0.7),
        makeEdge('B', 'C', 0.7),
        makeEdge('C', 'A', 0.5),
        makeEdge('B', 'D', 0.9),
      ];

      const run1 = buildDependencyGraph({ concepts, dependencies: edges });
      const run2 = buildDependencyGraph({ concepts, dependencies: edges });

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('produces identical output even when input edges are shuffled', () => {
      const concepts = [
        makeConcept('A', 1),
        makeConcept('B', 2),
        makeConcept('C', 3),
        makeConcept('D', 4),
      ];
      const edges = [
        makeEdge('A', 'B', 0.8, 'e1'),
        makeEdge('B', 'C', 0.6, 'e2'),
        makeEdge('C', 'A', 0.6, 'e3'),
        makeEdge('B', 'D', 0.9, 'e4'),
      ];

      const standardResult = buildDependencyGraph({ concepts, dependencies: edges });

      // Permutations of edge orders
      const permutations = [
        [edges[3], edges[2], edges[1], edges[0]],
        [edges[1], edges[3], edges[0], edges[2]],
        [edges[2], edges[0], edges[3], edges[1]],
      ];

      for (const shuffled of permutations) {
        const result = buildDependencyGraph({ concepts, dependencies: shuffled });
        expect(result.orderedConcepts.map((c) => c.id)).toEqual(
          standardResult.orderedConcepts.map((c) => c.id),
        );
        expect(result.activeEdges.map((e) => e.id).sort()).toEqual(
          standardResult.activeEdges.map((e) => e.id).sort(),
        );
        expect(result.removedEdges.map((e) => e.id).sort()).toEqual(
          standardResult.removedEdges.map((e) => e.id).sort(),
        );
      }
    });
  });

  describe('Property-Style Random Graph Testing (100 Random Graphs)', () => {
    it('guarantees acyclicity, valid topo order, and 100% concept retention on 100 random graphs', () => {
      const NUM_GRAPHS = 100;

      for (let g = 0; g < NUM_GRAPHS; g++) {
        // Random concept count between 3 and 12
        const n = 3 + Math.floor(Math.random() * 10);
        const concepts: ConceptRecord[] = [];
        for (let i = 0; i < n; i++) {
          concepts.push(makeConcept(`node_${i}`, i + 1));
        }

        // Random directed edges (including potential self-loops, duplicates, and cycles)
        const edgeCount = Math.floor(Math.random() * (n * 2.5));
        const edges: ConceptDependencyRecord[] = [];
        for (let e = 0; e < edgeCount; e++) {
          const from = `node_${Math.floor(Math.random() * n)}`;
          const to = `node_${Math.floor(Math.random() * n)}`;
          const conf = Math.round(Math.random() * 100) / 100;
          edges.push(makeEdge(from, to, conf, `rand_edge_${g}_${e}`));
        }

        const result = buildDependencyGraph({ concepts, dependencies: edges });

        // Invariant 1: All nodes must be present
        expect(result.orderedConcepts.length).toBe(concepts.length);
        const seenIds = new Set(result.orderedConcepts.map((c) => c.id));
        expect(seenIds.size).toBe(concepts.length);

        // Invariant 2: Result must be strictly acyclic
        expect(result.diagnostics.isAcyclic).toBe(true);

        // Invariant 3: Topo order respects every active edge
        const posMap = new Map<string, number>();
        result.orderedConcepts.forEach((c, idx) => posMap.set(c.id, idx));

        for (const activeEdge of result.activeEdges) {
          const pPos = posMap.get(activeEdge.prerequisiteId)!;
          const dPos = posMap.get(activeEdge.dependentConceptId)!;
          expect(pPos).toBeLessThan(dPos);
        }

        // Invariant 4: Graph integrity validator passes without error
        expect(() =>
          validateGraphIntegrity(concepts, result.activeEdges, result.orderedConcepts),
        ).not.toThrow();
      }
    });
  });

  describe('Downstream Influence & Tier Computation', () => {
    it('computes normalized downstream influence in [0, 1]', () => {
      // Linear chain: A -> B -> C -> D (N = 4, maxDescendants = 3)
      const concepts = [
        makeConcept('A', 1),
        makeConcept('B', 2),
        makeConcept('C', 3),
        makeConcept('D', 4),
      ];
      const edges = [
        makeEdge('A', 'B'),
        makeEdge('B', 'C'),
        makeEdge('C', 'D'),
      ];

      const result = buildDependencyGraph({ concepts, dependencies: edges });

      // A reaches B, C, D (3/3 = 1.0)
      expect(result.downstreamInfluence.get('A')).toBe(1.0);
      // B reaches C, D (2/3 = 0.6667)
      expect(result.downstreamInfluence.get('B')).toBeCloseTo(0.6667, 3);
      // C reaches D (1/3 = 0.3333)
      expect(result.downstreamInfluence.get('C')).toBeCloseTo(0.3333, 3);
      // D reaches nothing (0/3 = 0.0)
      expect(result.downstreamInfluence.get('D')).toBe(0.0);
    });

    it('assigns tier 0 to disconnected concepts and calculates longest path tiers', () => {
      // Tree: A -> B -> C (depth 0, 1, 2)
      // Disconnected: D, E
      const concepts = [
        makeConcept('A', 1),
        makeConcept('B', 2),
        makeConcept('C', 3),
        makeConcept('D', 4),
        makeConcept('E', 5),
      ];
      const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];

      const result = buildDependencyGraph({ concepts, dependencies: edges });

      expect(result.tiers.get('A')).toBe(0);
      expect(result.tiers.get('B')).toBe(1);
      expect(result.tiers.get('C')).toBe(2);
      expect(result.tiers.get('D')).toBe(0);
      expect(result.tiers.get('E')).toBe(0);
    });
  });

  describe('Linear Fallback Mode', () => {
    it('orders concepts by source-chunk position and marks graphMode = "fallback_linear"', () => {
      const concepts = [
        {
          ...makeConcept('ConceptC', 1),
          sourceChunkIds: ['chunk-3'],
        },
        {
          ...makeConcept('ConceptA', 2),
          sourceChunkIds: ['chunk-1'],
        },
        {
          ...makeConcept('ConceptB', 3),
          sourceChunkIds: ['chunk-2'],
        },
      ];

      const chunks: DocumentChunkRecord[] = [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          chunkIndex: 0,
          text: 'Chunk 1',
          startOffset: 0,
          endOffset: 50,
          contentHash: 'hash-1',
          createdAt: '2026-10-22T00:00:00Z',
        },
        {
          id: 'chunk-2',
          documentId: 'doc-1',
          chunkIndex: 1,
          text: 'Chunk 2',
          startOffset: 51,
          endOffset: 100,
          contentHash: 'hash-2',
          createdAt: '2026-10-22T00:00:00Z',
        },
        {
          id: 'chunk-3',
          documentId: 'doc-1',
          chunkIndex: 2,
          text: 'Chunk 3',
          startOffset: 101,
          endOffset: 150,
          contentHash: 'hash-3',
          createdAt: '2026-10-22T00:00:00Z',
        },
      ];

      const result = linearFallbackOrder({
        concepts,
        chunks,
        reason: 'Extraction failed test.',
      });

      expect(result.graphMode).toBe('fallback_linear');
      expect(result.diagnostics.fallbackReason).toBe('Extraction failed test.');
      // Sequential source chunk order: ConceptA (chunk 1), ConceptB (chunk 2), ConceptC (chunk 3)
      expect(result.orderedConcepts.map((c) => c.id)).toEqual([
        'ConceptA',
        'ConceptB',
        'ConceptC',
      ]);
    });
  });
});
