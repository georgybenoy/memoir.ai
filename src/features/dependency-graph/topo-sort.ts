/**
 * Kahn's Topological Sort with Deterministic Stable Tie-Breaking
 * Tie-breaking order: extractionOrder ascending, then id ascending.
 * Source of truth: PRD FR-04, TECH_STACK §9.1
 */

import { type ConceptRecord } from '@/types/domain';
import { type NormalizedGraphEdge } from './types';

/**
 * Performs Kahn's algorithm on the active edges of the DAG.
 * Guarantees stable tie-breaking:
 * When multiple concepts have in-degree 0 simultaneously, the one with
 * lowest extractionOrder is selected next; ties broken lexicographically by ID.
 *
 * @param concepts All concepts in the graph
 * @param activeEdges Acyclic directed edges
 * @returns Ordered array of ConceptRecord in topological order
 */
export function kahnTopologicalSort(
  concepts: ConceptRecord[],
  activeEdges: NormalizedGraphEdge[],
): ConceptRecord[] {
  const conceptMap = new Map<string, ConceptRecord>();
  for (const c of concepts) {
    conceptMap.set(c.id, c);
  }

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const c of concepts) {
    inDegree.set(c.id, 0);
    adj.set(c.id, []);
  }

  for (const edge of activeEdges) {
    if (inDegree.has(edge.dependentConceptId)) {
      inDegree.set(
        edge.dependentConceptId,
        inDegree.get(edge.dependentConceptId)! + 1,
      );
    }
    if (adj.has(edge.prerequisiteId)) {
      adj.get(edge.prerequisiteId)!.push(edge.dependentConceptId);
    }
  }

  // Ready set: all concepts with initial in-degree 0
  const readyList: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      readyList.push(id);
    }
  }

  const compareReadyNodes = (idA: string, idB: string): number => {
    const cA = conceptMap.get(idA);
    const cB = conceptMap.get(idB);
    const orderA = cA?.extractionOrder ?? 0;
    const orderB = cB?.extractionOrder ?? 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return idA.localeCompare(idB);
  };

  const orderedConcepts: ConceptRecord[] = [];

  while (readyList.length > 0) {
    // Sort ready list so smallest (extractionOrder, id) is at the front
    readyList.sort(compareReadyNodes);
    const currentId = readyList.shift()!;
    const concept = conceptMap.get(currentId);
    if (concept) {
      orderedConcepts.push(concept);
    }

    const dependents = adj.get(currentId) ?? [];
    for (const depId of dependents) {
      const currentDeg = inDegree.get(depId);
      if (currentDeg !== undefined) {
        const nextDeg = currentDeg - 1;
        inDegree.set(depId, nextDeg);
        if (nextDeg === 0) {
          readyList.push(depId);
        }
      }
    }
  }

  return orderedConcepts;
}
