/**
 * Fallback Linear Ordering Service
 * Used when AI graph extraction fails or produces unrecoverable structures.
 * Orders concepts by source document chunk position (or extractionOrder)
 * and marks graphMode: "fallback_linear" so the UI displays the approximate ordering notice.
 * Source of truth: PRD FR-04, TECH_STACK §9.1
 */

import {
  type ConceptRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
} from '@/types/domain';
import { type DependencyGraphResult, type NormalizedGraphEdge } from './types';

export interface LinearFallbackOptions {
  concepts: ConceptRecord[];
  chunks?: DocumentChunkRecord[];
  rawDependencies?: Array<ConceptDependencyRecord | NormalizedGraphEdge>;
  reason?: string;
}

/**
 * Builds a deterministic linear fallback ordering when graph extraction fails:
 * 1. Computes the earliest source chunk index for each concept.
 * 2. Sorts concepts by (earliest chunk index, extractionOrder, concept ID).
 * 3. Assigns tier 0 to foundational concepts (first half) and tier 1 (second half) or linear steps.
 * 4. Marks all raw dependencies as removed with reason 'fallback_linear_mode'.
 * 5. Returns a valid DependencyGraphResult with graphMode: "fallback_linear".
 */
export function linearFallbackOrder(
  options: LinearFallbackOptions,
): DependencyGraphResult {
  const {
    concepts,
    chunks = [],
    rawDependencies = [],
    reason = 'Graph extraction failed; using source chunk sequential order.',
  } = options;

  // Map chunk IDs to chunkIndex
  const chunkIndexMap = new Map<string, number>();
  for (const chunk of chunks) {
    chunkIndexMap.set(chunk.id, chunk.chunkIndex);
  }

  // Clone concepts to avoid mutating input array
  const orderedConcepts = concepts.map((c) => ({ ...c }));

  orderedConcepts.sort((a, b) => {
    // 1. Minimum source chunk index
    const minChunkA =
      a.sourceChunkIds && a.sourceChunkIds.length > 0
        ? Math.min(...a.sourceChunkIds.map((id) => chunkIndexMap.get(id) ?? 999999))
        : 999999;
    const minChunkB =
      b.sourceChunkIds && b.sourceChunkIds.length > 0
        ? Math.min(...b.sourceChunkIds.map((id) => chunkIndexMap.get(id) ?? 999999))
        : 999999;

    if (minChunkA !== minChunkB) {
      return minChunkA - minChunkB;
    }

    // 2. Extraction order
    if (a.extractionOrder !== b.extractionOrder) {
      return a.extractionOrder - b.extractionOrder;
    }

    // 3. ID lexicographical
    return a.id.localeCompare(b.id);
  });

  const tiers = new Map<string, number>();
  const downstreamInfluence = new Map<string, number>();
  const total = orderedConcepts.length;

  orderedConcepts.forEach((c, idx) => {
    // In fallback mode, assign tier 0 to first half, tier 1 to second half
    const tier = total <= 2 ? 0 : idx < Math.ceil(total / 2) ? 0 : 1;
    c.tier = tier;
    tiers.set(c.id, tier);

    // Approximate influence based on remaining linear concepts
    const remaining = total - 1 - idx;
    const influence = total > 1 ? Math.round((remaining / (total - 1)) * 10000) / 10000 : 0;
    downstreamInfluence.set(c.id, influence);
  });

  // Deactivate all raw dependencies in fallback mode
  const removedEdges: NormalizedGraphEdge[] = rawDependencies.map((dep) => ({
    id: dep.id,
    prerequisiteId: dep.prerequisiteId,
    dependentConceptId: dep.dependentConceptId,
    confidence: dep.confidence ?? 0,
    removed: true,
    removedReason: 'fallback_linear_mode',
    createdAt: dep.createdAt,
  }));

  return {
    orderedConcepts,
    activeEdges: [],
    removedEdges,
    allEdges: removedEdges,
    tiers,
    downstreamInfluence,
    graphMode: 'fallback_linear',
    diagnostics: {
      graphMode: 'fallback_linear',
      totalConcepts: concepts.length,
      totalRawDependencies: rawDependencies.length,
      activeDependenciesCount: 0,
      removedDependencies: removedEdges,
      cyclesDetectedCount: 0,
      isAcyclic: true,
      fallbackReason: reason,
    },
  };
}
