import {
  type ConceptRecord,
  type ConceptDependencyRecord,
  type DocumentChunkRecord,
  type LearningUnitRecord,
} from '@/types/domain';
import { generateId } from '@/lib/utils/id';
import { nowISO } from '@/lib/utils/clock';
import {
  type UnitBuildInput,
  type BuildUnitsResult,
  DEFAULT_UNIT_CONFIG,
} from './types';

/**
 * Deterministically sorts concepts using topological sorting over prerequisite relationships.
 * Concepts with no prerequisites (foundational concepts) come first.
 * Deterministic tie-breaking is enforced by extractionOrder, then source chunk index, then title.
 */
export function sortConceptsTopologically(
  concepts: ConceptRecord[],
  dependencies: ConceptDependencyRecord[],
  chunks: DocumentChunkRecord[],
): ConceptRecord[] {
  const conceptMap = new Map<string, ConceptRecord>(concepts.map((c) => [c.id, c]));
  const chunkIndexMap = new Map<string, number>(chunks.map((ch) => [ch.id, ch.chunkIndex]));

  // Helper to get minimum chunk index for a concept
  function getMinChunkIndex(concept: ConceptRecord): number {
    if (!concept.sourceChunkIds || concept.sourceChunkIds.length === 0) return 99999;
    let minIdx = 99999;
    for (const cid of concept.sourceChunkIds) {
      const idx = chunkIndexMap.get(cid);
      if (idx !== undefined && idx < minIdx) {
        minIdx = idx;
      }
    }
    return minIdx;
  }

  // Build active adjacency & in-degree (ignore removed edges)
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const c of concepts) {
    inDegree.set(c.id, 0);
    outgoing.set(c.id, []);
  }

  for (const dep of dependencies) {
    if (dep.removed) continue;
    if (conceptMap.has(dep.prerequisiteId) && conceptMap.has(dep.dependentConceptId)) {
      inDegree.set(dep.dependentConceptId, (inDegree.get(dep.dependentConceptId) ?? 0) + 1);
      outgoing.get(dep.prerequisiteId)?.push(dep.dependentConceptId);
    }
  }

  // Tie-breaker comparator
  function compareConcepts(a: ConceptRecord, b: ConceptRecord): number {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.extractionOrder !== b.extractionOrder) return a.extractionOrder - b.extractionOrder;
    const aChunk = getMinChunkIndex(a);
    const bChunk = getMinChunkIndex(b);
    if (aChunk !== bChunk) return aChunk - bChunk;
    return a.title.localeCompare(b.title);
  }

  // Kahn's algorithm with priority queue simulation (deterministic array sorting)
  const available: ConceptRecord[] = concepts
    .filter((c) => (inDegree.get(c.id) ?? 0) === 0)
    .sort(compareConcepts);

  const ordered: ConceptRecord[] = [];
  const visited = new Set<string>();

  while (available.length > 0) {
    const current = available.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    ordered.push(current);

    const dependents = outgoing.get(current.id) ?? [];
    for (const depId of dependents) {
      const currentIn = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, currentIn);
      if (currentIn <= 0 && !visited.has(depId)) {
        const depConcept = conceptMap.get(depId);
        if (depConcept && !available.some((c) => c.id === depConcept.id)) {
          available.push(depConcept);
          available.sort(compareConcepts);
        }
      }
    }
  }

  // Catch any remaining cycles or isolated nodes
  if (ordered.length < concepts.length) {
    const remaining = concepts
      .filter((c) => !visited.has(c.id))
      .sort(compareConcepts);
    ordered.push(...remaining);
  }

  return ordered;
}

/**
 * Asserts the invariant: Every concept belongs to exactly one unit.
 */
export function assertUnitsComplete(
  concepts: ConceptRecord[],
  units: LearningUnitRecord[],
): void {
  const assigned = new Map<string, number>();

  for (const u of units) {
    for (const cid of u.conceptIds) {
      assigned.set(cid, (assigned.get(cid) ?? 0) + 1);
    }
  }

  const duplicates = Array.from(assigned.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate concepts across units: ${duplicates.join(', ')}`);
  }

  const missing = concepts.filter((c) => !assigned.has(c.id)).map((c) => c.id);
  if (missing.length > 0) {
    throw new Error(`Missing concepts: ${missing.join(', ')}`);
  }
}

/**
 * Builds learning units deterministically from structured concepts and notes:
 * 1. Topological sorting guarantees prerequisite hierarchy.
 * 2. If concepts <= minConcepts (default 3), creates a single unit.
 * 3. Clusters concepts into groups between minConcepts (3) and maxConcepts (8).
 * 4. Fallback titles and summaries derive deterministically from the primary concept and document title.
 * 5. Invariant: Every concept belongs to exactly ONE unit.
 */
export function buildLearningUnits(
  input: UnitBuildInput,
  directConfig?: { minConcepts?: number; maxConcepts?: number },
): BuildUnitsResult {
  const {
    materialId,
    contentVersion,
    concepts,
    dependencies,
    chunks,
    headings = [],
    config = {},
  } = input;

  if (concepts.length === 0) {
    return { units: [], conceptUnitMap: new Map() };
  }

  const minConcepts =
    directConfig?.minConcepts ??
    config.minConceptsPerUnit ??
    DEFAULT_UNIT_CONFIG.minConceptsPerUnit;
  const maxConcepts =
    directConfig?.maxConcepts ??
    config.maxConceptsPerUnit ??
    DEFAULT_UNIT_CONFIG.maxConceptsPerUnit;

  // 1. Deterministic topological sorting
  const sortedConcepts = sortConceptsTopologically(concepts, dependencies, chunks);

  // 2. Special case: If total concepts <= minConcepts, create a single comprehensive unit
  if (sortedConcepts.length <= minConcepts) {
    const unitId = generateId();
    const primaryConcept = sortedConcepts[0];
    const unitTitle = primaryConcept.title;
    const unitSummary = primaryConcept.summary;
    const sourceChunkIds = Array.from(
      new Set(sortedConcepts.flatMap((c) => c.sourceChunkIds || [])),
    );

    const singleUnit: LearningUnitRecord = {
      id: unitId,
      materialId,
      order: 0,
      title: unitTitle,
      summary: unitSummary,
      conceptIds: sortedConcepts.map((c) => c.id),
      sourceChunkIds,
      contentVersion,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    const conceptUnitMap = new Map<string, string>();
    for (const c of sortedConcepts) {
      conceptUnitMap.set(c.id, unitId);
    }

    return { units: [singleUnit], conceptUnitMap };
  }

  // 3. Cluster topologically sorted concepts into chunks of [minConcepts, maxConcepts]
  // We determine ideal bucket size target (5 concepts per unit by default)
  const targetPerUnit = Math.max(minConcepts, Math.min(maxConcepts, 5));
  const conceptClusters: ConceptRecord[][] = [];
  let currentCluster: ConceptRecord[] = [];

  for (let i = 0; i < sortedConcepts.length; i++) {
    currentCluster.push(sortedConcepts[i]);

    if (currentCluster.length >= maxConcepts) {
      conceptClusters.push(currentCluster);
      currentCluster = [];
    } else if (currentCluster.length >= targetPerUnit) {
      // Check remaining concepts
      const remainingCount = sortedConcepts.length - (i + 1);
      // If remaining concepts would leave an orphan (< minConcepts), don't break yet unless at maxConcepts
      if (remainingCount >= minConcepts) {
        conceptClusters.push(currentCluster);
        currentCluster = [];
      }
    }
  }

  if (currentCluster.length > 0) {
    if (currentCluster.length < minConcepts && conceptClusters.length > 0) {
      // Last cluster is too small: merge with previous cluster or rebalance
      const prevCluster = conceptClusters[conceptClusters.length - 1];
      if (prevCluster.length + currentCluster.length <= maxConcepts) {
        prevCluster.push(...currentCluster);
      } else {
        // Rebalance between prevCluster and currentCluster
        const combined = [...prevCluster, ...currentCluster];
        const half = Math.ceil(combined.length / 2);
        conceptClusters[conceptClusters.length - 1] = combined.slice(0, half);
        conceptClusters.push(combined.slice(half));
      }
    } else {
      conceptClusters.push(currentCluster);
    }
  }

  // 4. Construct LearningUnitRecord objects
  const units: LearningUnitRecord[] = [];
  const conceptUnitMap = new Map<string, string>();

  for (let idx = 0; idx < conceptClusters.length; idx++) {
    const cluster = conceptClusters[idx];
    const unitId = generateId();
    const primaryConcept = cluster[0];

    // Determine deterministic title
    let unitTitle = '';
    if (headings.length > idx && headings[idx].title) {
      unitTitle = headings[idx].title;
    } else if (idx === 0) {
      unitTitle = `${primaryConcept.title} Foundations`;
    } else if (idx === conceptClusters.length - 1) {
      unitTitle = `${primaryConcept.title} & Advanced Topics`;
    } else {
      unitTitle = `${primaryConcept.title} & Core Principles`;
    }

    // Determine deterministic summary
    const otherTitles = cluster.slice(1, 4).map((c) => c.title);
    const summarySuffix =
      otherTitles.length > 0 ? ` Covers ${otherTitles.join(', ')}.` : '';
    const unitSummary = `${primaryConcept.summary}${summarySuffix}`;

    const sourceChunkIds = Array.from(
      new Set(cluster.flatMap((c) => c.sourceChunkIds || [])),
    );

    const unit: LearningUnitRecord = {
      id: unitId,
      materialId,
      order: idx,
      title: unitTitle,
      summary: unitSummary,
      conceptIds: cluster.map((c) => c.id),
      sourceChunkIds,
      contentVersion,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    units.push(unit);
    for (const c of cluster) {
      conceptUnitMap.set(c.id, unitId);
    }
  }

  // 5. Invariant validation: verify every single concept belongs to exactly one unit
  const assignedConcepts = new Set<string>();
  for (const u of units) {
    for (const cid of u.conceptIds) {
      if (assignedConcepts.has(cid)) {
        throw new Error(`Invariant violation: concept ${cid} assigned to multiple learning units.`);
      }
      assignedConcepts.add(cid);
    }
  }

  if (assignedConcepts.size !== concepts.length) {
    throw new Error(
      `Invariant violation: ${concepts.length - assignedConcepts.size} concepts were omitted from learning units.`,
    );
  }

  return { units, conceptUnitMap };
}
