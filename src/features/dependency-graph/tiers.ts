/**
 * Depth Tiers and Downstream Influence Calculations
 * Source of truth: PRD FR-04, TECH_STACK §9.1, §9.3
 */

import { type ConceptRecord } from '@/types/domain';
import { type NormalizedGraphEdge } from './types';

/**
 * Computes depth tiers by longest path from source nodes in the DAG:
 * - Tier 0: Foundational primitives (in-degree 0 or disconnected concepts)
 * - Tier 1: Core mechanisms (depend directly only on Tier 0 concepts)
 * - Tier 2+: Advanced concepts (depend on Tier 1 or deeper concepts)
 *
 * Disconnected concepts have in-degree 0 and are assigned Tier 0.
 *
 * @param concepts All concepts
 * @param activeEdges Acyclic directed edges
 * @param topoOrder Concept list in valid topological order
 * @returns Map of concept ID -> depth tier integer (0, 1, 2, ...)
 */
export function computeDepthTiers(
  concepts: ConceptRecord[],
  activeEdges: NormalizedGraphEdge[],
  topoOrder: ConceptRecord[],
): Map<string, number> {
  const prereqMap = new Map<string, string[]>();
  for (const c of concepts) {
    prereqMap.set(c.id, []);
  }

  for (const edge of activeEdges) {
    if (prereqMap.has(edge.dependentConceptId)) {
      prereqMap.get(edge.dependentConceptId)!.push(edge.prerequisiteId);
    }
  }

  const tiers = new Map<string, number>();

  // Process nodes in topological order so all prerequisites of a node are evaluated beforehand
  for (const concept of topoOrder) {
    const prereqs = prereqMap.get(concept.id) ?? [];
    if (prereqs.length === 0) {
      // Source node or disconnected node: Tier 0
      tiers.set(concept.id, 0);
    } else {
      let maxPrereqTier = 0;
      for (const pId of prereqs) {
        const pTier = tiers.get(pId) ?? 0;
        if (pTier > maxPrereqTier) {
          maxPrereqTier = pTier;
        }
      }
      tiers.set(concept.id, maxPrereqTier + 1);
    }
  }

  // Fallback for any concept not in topoOrder (should not happen in valid DAG)
  for (const c of concepts) {
    if (!tiers.has(c.id)) {
      tiers.set(c.id, 0);
    }
  }

  return tiers;
}

/**
 * Computes downstream influence for each concept in the graph.
 * Downstream influence is defined as the normalized count of reachable descendants:
 *   influence = reachableDescendantsCount / (N - 1) for N > 1, else 0.
 *
 * Returns a value bounded in [0, 1], representing graph centrality for Phase 6 difficulty.
 *
 * @param concepts All concepts
 * @param activeEdges Acyclic directed edges
 * @returns Map of concept ID -> normalized influence in [0, 1]
 */
export function computeDownstreamInfluence(
  concepts: ConceptRecord[],
  activeEdges: NormalizedGraphEdge[],
): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const c of concepts) {
    adj.set(c.id, []);
  }

  for (const edge of activeEdges) {
    if (adj.has(edge.prerequisiteId)) {
      adj.get(edge.prerequisiteId)!.push(edge.dependentConceptId);
    }
  }

  const influenceMap = new Map<string, number>();
  const totalConcepts = concepts.length;

  if (totalConcepts <= 1) {
    for (const c of concepts) {
      influenceMap.set(c.id, 0);
    }
    return influenceMap;
  }

  const maxPossibleDescendants = totalConcepts - 1;

  for (const concept of concepts) {
    // Breadth-first search to find all reachable descendants
    const visited = new Set<string>();
    const queue = [concept.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const dependents = adj.get(current) ?? [];
      for (const depId of dependents) {
        if (!visited.has(depId) && depId !== concept.id) {
          visited.add(depId);
          queue.push(depId);
        }
      }
    }

    const descendantCount = visited.size;
    const normalized = descendantCount / maxPossibleDescendants;
    // Round to 4 decimal places for floating-point sanity
    influenceMap.set(concept.id, Math.round(normalized * 10000) / 10000);
  }

  return influenceMap;
}
