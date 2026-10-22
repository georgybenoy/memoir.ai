/**
 * Cycle Detection & Deterministic Cycle Resolution
 * Source of truth: PRD FR-04, TECH_STACK §9.1
 *
 * TIE-BREAKING SPECIFICATION FOR CYCLE REMOVAL:
 * Within each cyclic SCC, candidate edges (edges where both endpoints belong to the SCC)
 * are ranked for removal. The single highest-ranked candidate edge is removed:
 *   1. Lowest confidence first (ascending: e.g. 0.3 removed before 0.8).
 *   2. If confidence is tied: The dependent concept with the LOWER extractionOrder is KEPT LAST.
 *      Consequently, the edge whose dependent concept has the HIGHER extractionOrder is REMOVED FIRST.
 *   3. If dependent extractionOrder is tied: Lexicographic ordering on (fromId, toId).
 *      The edge with smaller (prerequisiteId, dependentConceptId) is removed first.
 *
 * This process repeats iteratively until no cyclic SCCs remain.
 */

import { type ConceptRecord, type ConceptDependencyRecord } from '@/types/domain';
import { type NormalizedGraphEdge } from './types';
import { findStronglyConnectedComponents, isCyclicScc } from './tarjan';

export interface NormalizationResult {
  validEdges: NormalizedGraphEdge[];
  removedEdges: NormalizedGraphEdge[];
  allEdges: NormalizedGraphEdge[];
}

/**
 * Normalizes input dependency edges:
 * - Drops self-loops (prerequisiteId === dependentConceptId)
 * - Drops edges with unknown prerequisite or dependent concepts
 * - Drops duplicate edges between the same (prerequisite, dependent) pair, retaining the highest confidence
 */
export function normalizeDependencies(
  concepts: ConceptRecord[],
  rawDependencies: Array<ConceptDependencyRecord | NormalizedGraphEdge>,
): NormalizationResult {
  const conceptMap = new Map<string, ConceptRecord>();
  for (const c of concepts) {
    conceptMap.set(c.id, c);
  }

  const validEdges: NormalizedGraphEdge[] = [];
  const removedEdges: NormalizedGraphEdge[] = [];
  const allEdges: NormalizedGraphEdge[] = [];

  // Group by unique (from, to) pair to detect duplicates deterministically
  const edgeGroups = new Map<string, NormalizedGraphEdge[]>();

  for (const raw of rawDependencies) {
    const edge: NormalizedGraphEdge = {
      id: raw.id,
      prerequisiteId: raw.prerequisiteId,
      dependentConceptId: raw.dependentConceptId,
      confidence: typeof raw.confidence === 'number' && !isNaN(raw.confidence) ? raw.confidence : 0.5,
      removed: false,
      removedReason: undefined,
      createdAt: raw.createdAt,
    };

    allEdges.push(edge);

    // 1. Self-loop check
    if (edge.prerequisiteId === edge.dependentConceptId) {
      edge.removed = true;
      edge.removedReason = 'self_loop';
      removedEdges.push(edge);
      continue;
    }

    // 2. Unknown prerequisite check
    if (!conceptMap.has(edge.prerequisiteId)) {
      edge.removed = true;
      edge.removedReason = 'unknown_prerequisite';
      removedEdges.push(edge);
      continue;
    }

    // 3. Unknown dependent check
    if (!conceptMap.has(edge.dependentConceptId)) {
      edge.removed = true;
      edge.removedReason = 'unknown_dependent';
      removedEdges.push(edge);
      continue;
    }

    // Candidate for duplicate detection
    const pairKey = `${edge.prerequisiteId}-->${edge.dependentConceptId}`;
    if (!edgeGroups.has(pairKey)) {
      edgeGroups.set(pairKey, []);
    }
    edgeGroups.get(pairKey)!.push(edge);
  }

  // Deduplicate edges per (from, to) pair
  // Sort pairs lexicographically so iteration order is deterministic
  const sortedPairKeys = Array.from(edgeGroups.keys()).sort();
  for (const pairKey of sortedPairKeys) {
    const group = edgeGroups.get(pairKey)!;
    if (group.length === 1) {
      validEdges.push(group[0]);
    } else {
      // Multiple edges between the same concept pair
      // Keep highest confidence; ties broken by earliest id lexicographically
      group.sort((a, b) => {
        if (b.confidence !== a.confidence) {
          return b.confidence - a.confidence; // Descending confidence
        }
        return a.id.localeCompare(b.id);
      });

      const [keptEdge, ...duplicates] = group;
      validEdges.push(keptEdge);

      for (const dup of duplicates) {
        dup.removed = true;
        dup.removedReason = 'duplicate_edge';
        removedEdges.push(dup);
      }
    }
  }

  return { validEdges, removedEdges, allEdges };
}

/**
 * Comparator to pick which edge within a cyclic SCC to REMOVE.
 * Follows the exact deterministic tie-breaking specification:
 * 1. Lowest confidence first.
 * 2. Dependent concept with lower extractionOrder kept last -> higher extractionOrder removed first.
 * 3. Lexicographical comparison of (prerequisiteId, dependentConceptId).
 */
export function compareEdgesForCycleRemoval(
  edgeA: NormalizedGraphEdge,
  edgeB: NormalizedGraphEdge,
  conceptMap: Map<string, ConceptRecord>,
): number {
  // 1. Lowest confidence removed first
  if (edgeA.confidence !== edgeB.confidence) {
    return edgeA.confidence - edgeB.confidence;
  }

  // 2. Dependent with lower extractionOrder kept last -> higher extractionOrder removed first
  const orderA = conceptMap.get(edgeA.dependentConceptId)?.extractionOrder ?? 0;
  const orderB = conceptMap.get(edgeB.dependentConceptId)?.extractionOrder ?? 0;
  if (orderA !== orderB) {
    return orderB - orderA; // Descending: higher order comes first
  }

  // 3. Lexicographic (fromId, toId)
  const fromCmp = edgeA.prerequisiteId.localeCompare(edgeB.prerequisiteId);
  if (fromCmp !== 0) {
    return fromCmp;
  }
  return edgeA.dependentConceptId.localeCompare(edgeB.dependentConceptId);
}

export interface CycleResolutionResult {
  activeEdges: NormalizedGraphEdge[];
  removedCycleEdges: NormalizedGraphEdge[];
  cycleCount: number;
}

/**
 * Iteratively identifies cyclic SCCs and deterministically removes the worst edge
 * until the graph is strictly acyclic.
 */
export function resolveCyclesDeterministically(
  concepts: ConceptRecord[],
  initialEdges: NormalizedGraphEdge[],
): CycleResolutionResult {
  const conceptMap = new Map<string, ConceptRecord>();
  for (const c of concepts) {
    conceptMap.set(c.id, c);
  }

  const activeEdges = [...initialEdges];
  const removedCycleEdges: NormalizedGraphEdge[] = [];
  const nodeIds = concepts.map((c) => c.id);

  let cycleResolutionsCount = 0;
  const maxIterations = initialEdges.length + 1; // Safeguard against infinite loops

  while (cycleResolutionsCount < maxIterations) {
    const sccs = findStronglyConnectedComponents(nodeIds, activeEdges);
    const cyclicSccs = sccs.filter((scc) => isCyclicScc(scc, activeEdges));

    if (cyclicSccs.length === 0) {
      // Graph is completely acyclic
      break;
    }

    // Sort cyclic SCCs deterministically by lowest extractionOrder of their nodes, then min node ID
    cyclicSccs.sort((sccA, sccB) => {
      const minOrderA = Math.min(
        ...sccA.map((id) => conceptMap.get(id)?.extractionOrder ?? 0),
      );
      const minOrderB = Math.min(
        ...sccB.map((id) => conceptMap.get(id)?.extractionOrder ?? 0),
      );
      if (minOrderA !== minOrderB) {
        return minOrderA - minOrderB;
      }
      return sccA[0].localeCompare(sccB[0]);
    });

    const targetScc = cyclicSccs[0];
    const sccNodeSet = new Set(targetScc);

    // Candidate edges: both endpoints must be within the cyclic SCC
    const candidateEdges = activeEdges.filter(
      (e) => sccNodeSet.has(e.prerequisiteId) && sccNodeSet.has(e.dependentConceptId),
    );

    if (candidateEdges.length === 0) {
      // Should not happen for a cyclic SCC, but guard against deadlock
      break;
    }

    // Sort candidates using deterministic comparator; index 0 is chosen for removal
    candidateEdges.sort((a, b) => compareEdgesForCycleRemoval(a, b, conceptMap));
    const edgeToRemove = candidateEdges[0];

    // Remove from active edges
    const activeIndex = activeEdges.findIndex((e) => e.id === edgeToRemove.id);
    if (activeIndex !== -1) {
      activeEdges.splice(activeIndex, 1);
    }

    // Flag as removed for diagnostics and persistence
    edgeToRemove.removed = true;
    edgeToRemove.removedReason = 'cycle_resolution';
    removedCycleEdges.push(edgeToRemove);

    cycleResolutionsCount++;
  }

  return {
    activeEdges,
    removedCycleEdges,
    cycleCount: cycleResolutionsCount,
  };
}
