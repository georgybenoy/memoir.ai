/**
 * Graph Integrity Assertion and Verification
 * Source of truth: PRD FR-04, TECH_STACK §9.1
 */

import { type ConceptRecord } from '@/types/domain';
import { type NormalizedGraphEdge } from './types';
import { findStronglyConnectedComponents, isCyclicScc } from './tarjan';

export class GraphIntegrityError extends Error {
  public readonly code = 'GRAPH_INTEGRITY_VIOLATION';
  public readonly details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = 'GraphIntegrityError';
    this.details = details;
  }
}

export interface GraphIntegrityReport {
  isValid: boolean;
  errors: string[];
}

/**
 * Asserts graph integrity:
 * 1. All active edge endpoints exist in the concept set.
 * 2. Active edges are strictly acyclic (verified via Tarjan SCC).
 * 3. Topological sort order respects every active edge (prerequisite appears before dependent).
 * 4. All concepts are accounted for in the topological order exactly once.
 *
 * Throws GraphIntegrityError if any invariant is violated.
 */
export function validateGraphIntegrity(
  concepts: ConceptRecord[],
  activeEdges: NormalizedGraphEdge[],
  topoOrder: ConceptRecord[],
): GraphIntegrityReport {
  const errors: string[] = [];
  const conceptIds = new Set(concepts.map((c) => c.id));

  // Invariant 1: All active edge endpoints must exist
  for (const edge of activeEdges) {
    if (!conceptIds.has(edge.prerequisiteId)) {
      errors.push(`Active edge ${edge.id} references missing prerequisite concept "${edge.prerequisiteId}".`);
    }
    if (!conceptIds.has(edge.dependentConceptId)) {
      errors.push(`Active edge ${edge.id} references missing dependent concept "${edge.dependentConceptId}".`);
    }
  }

  // Invariant 2: Active edges must be strictly acyclic
  const sccs = findStronglyConnectedComponents(conceptIds, activeEdges);
  const cyclicSccs = sccs.filter((scc) => isCyclicScc(scc, activeEdges));
  if (cyclicSccs.length > 0) {
    errors.push(
      `Graph contains ${cyclicSccs.length} unresolved cyclic strongly connected component(s): ${JSON.stringify(cyclicSccs)}`,
    );
  }

  // Invariant 3: Topological order count and uniqueness
  if (topoOrder.length !== concepts.length) {
    errors.push(
      `Topological order contains ${topoOrder.length} concepts, but original graph has ${concepts.length} concepts.`,
    );
  }
  const topoSeen = new Set<string>();
  for (const c of topoOrder) {
    if (topoSeen.has(c.id)) {
      errors.push(`Topological order contains duplicate concept "${c.id}".`);
    }
    topoSeen.add(c.id);
  }
  for (const id of conceptIds) {
    if (!topoSeen.has(id)) {
      errors.push(`Concept "${id}" is missing from topological order.`);
    }
  }

  // Invariant 4: Topological order respects every active edge
  const topoPositionMap = new Map<string, number>();
  topoOrder.forEach((c, index) => {
    topoPositionMap.set(c.id, index);
  });

  for (const edge of activeEdges) {
    const prereqPos = topoPositionMap.get(edge.prerequisiteId);
    const depPos = topoPositionMap.get(edge.dependentConceptId);
    if (prereqPos !== undefined && depPos !== undefined && prereqPos >= depPos) {
      errors.push(
        `Topological violation: Prerequisite "${edge.prerequisiteId}" (pos ${prereqPos}) appears at or after dependent "${edge.dependentConceptId}" (pos ${depPos}) on edge ${edge.id}.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new GraphIntegrityError(
      `Graph integrity validation failed with ${errors.length} error(s).`,
      errors,
    );
  }

  return { isValid: true, errors: [] };
}
