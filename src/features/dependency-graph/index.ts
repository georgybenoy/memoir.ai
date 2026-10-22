/**
 * Dependency Graph Pipeline
 * Combines normalization, cycle resolution, Kahn's topological sort,
 * depth tier computation, downstream influence, and integrity validation.
 * Pure TypeScript, zero external graph dependencies.
 * Source of truth: PRD FR-04, TECH_STACK §9.1
 */

import {
  type ConceptRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
} from '@/types/domain';
import {
  type DependencyGraphResult,
  type NormalizedGraphEdge,
  type GraphDiagnostics,
} from './types';
import { normalizeDependencies, resolveCyclesDeterministically } from './cycle-resolution';
import { kahnTopologicalSort } from './topo-sort';
import { computeDepthTiers, computeDownstreamInfluence } from './tiers';
import { validateGraphIntegrity } from './integrity';
import { linearFallbackOrder } from './fallback';

export * from './types';
export * from './tarjan';
export * from './cycle-resolution';
export * from './topo-sort';
export * from './tiers';
export * from './integrity';
export * from './fallback';

export interface BuildDependencyGraphOptions {
  concepts: ConceptRecord[];
  dependencies: Array<ConceptDependencyRecord | NormalizedGraphEdge>;
  chunks?: DocumentChunkRecord[];
  forceFallback?: boolean;
}

/**
 * Executes the complete deterministic dependency graph pipeline:
 * 1. Input normalization: drops self-loops, duplicate edges, and edges to unknown concepts.
 * 2. Tarjan SCC cycle detection & deterministic tie-broken cycle edge removal.
 * 3. Kahn's topological sort with stable tie-breaking (extractionOrder, then ID).
 * 4. Depth tier computation (longest path from sources, tier 0 for foundational/disconnected).
 * 5. Downstream influence computation (normalized reachable descendants in [0, 1]).
 * 6. Graph integrity assertion.
 * 7. Graceful fallback to linearFallbackOrder if any unrecoverable condition occurs.
 */
export function buildDependencyGraph(
  options: BuildDependencyGraphOptions,
): DependencyGraphResult {
  const { concepts, dependencies, chunks = [], forceFallback = false } = options;

  if (concepts.length === 0) {
    return {
      orderedConcepts: [],
      activeEdges: [],
      removedEdges: [],
      allEdges: [],
      tiers: new Map(),
      downstreamInfluence: new Map(),
      graphMode: 'dag',
      diagnostics: {
        graphMode: 'dag',
        totalConcepts: 0,
        totalRawDependencies: 0,
        activeDependenciesCount: 0,
        removedDependencies: [],
        cyclesDetectedCount: 0,
        isAcyclic: true,
      },
    };
  }

  if (forceFallback) {
    return linearFallbackOrder({
      concepts,
      chunks,
      rawDependencies: dependencies,
      reason: 'Fallback linear mode explicitly requested.',
    });
  }

  try {
    // Step 1: Normalize edges
    const { validEdges, removedEdges: initialRemovedEdges, allEdges: normalizedAllEdges } =
      normalizeDependencies(concepts, dependencies);

    // Step 2: Cycle detection and deterministic cycle resolution
    const { activeEdges, removedCycleEdges, cycleCount } = resolveCyclesDeterministically(
      concepts,
      validEdges,
    );

    const allRemovedEdges = [...initialRemovedEdges, ...removedCycleEdges];

    // Build complete updated edge list for persistence
    const edgeMap = new Map<string, NormalizedGraphEdge>();
    for (const e of normalizedAllEdges) {
      edgeMap.set(e.id, e);
    }
    for (const r of allRemovedEdges) {
      edgeMap.set(r.id, r);
    }
    const finalAllEdges = Array.from(edgeMap.values());

    // Step 3: Kahn's topological sort with stable tie-breaking
    const topoOrder = kahnTopologicalSort(concepts, activeEdges);

    if (topoOrder.length !== concepts.length) {
      // Topological sort incomplete: fallback gracefully
      return linearFallbackOrder({
        concepts,
        chunks,
        rawDependencies: dependencies,
        reason: 'Topological sort failed to include all concepts; cycle resolution incomplete.',
      });
    }

    // Step 4: Compute depth tiers by longest path from sources
    const tiers = computeDepthTiers(concepts, activeEdges, topoOrder);

    // Update tier field directly on each concept in the ordered list
    for (const concept of topoOrder) {
      concept.tier = tiers.get(concept.id) ?? 0;
    }

    // Step 5: Compute downstream influence
    const downstreamInfluence = computeDownstreamInfluence(concepts, activeEdges);

    // Step 6: Validate graph integrity
    validateGraphIntegrity(concepts, activeEdges, topoOrder);

    const diagnostics: GraphDiagnostics = {
      graphMode: 'dag',
      totalConcepts: concepts.length,
      totalRawDependencies: dependencies.length,
      activeDependenciesCount: activeEdges.length,
      removedDependencies: allRemovedEdges,
      cyclesDetectedCount: cycleCount,
      isAcyclic: true,
    };

    return {
      orderedConcepts: topoOrder,
      activeEdges,
      removedEdges: allRemovedEdges,
      allEdges: finalAllEdges,
      tiers,
      downstreamInfluence,
      graphMode: 'dag',
      diagnostics,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return linearFallbackOrder({
      concepts,
      chunks,
      rawDependencies: dependencies,
      reason: `Graph resolution error: ${message}`,
    });
  }
}
