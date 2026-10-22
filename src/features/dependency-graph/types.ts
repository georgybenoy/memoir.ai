/**
 * Dependency Graph Types
 * Source of truth: PRD FR-04, TECH_STACK §9.1
 */

import { type ConceptRecord } from '@/types/domain';

export type GraphEdgeDropReason =
  | 'self_loop'
  | 'duplicate_edge'
  | 'unknown_prerequisite'
  | 'unknown_dependent'
  | 'cycle_resolution';

export type GraphMode = 'dag' | 'fallback_linear';

export interface NormalizedGraphEdge {
  id: string;
  prerequisiteId: string;
  dependentConceptId: string;
  confidence: number;
  removed: boolean;
  removedReason?: GraphEdgeDropReason | string;
  createdAt?: string;
}

export interface GraphDiagnostics {
  graphMode: GraphMode;
  totalConcepts: number;
  totalRawDependencies: number;
  activeDependenciesCount: number;
  removedDependencies: NormalizedGraphEdge[];
  cyclesDetectedCount: number;
  isAcyclic: boolean;
  fallbackReason?: string;
}

export interface DependencyGraphResult {
  /** Topologically sorted concept records with updated tiers */
  orderedConcepts: ConceptRecord[];
  /** Non-removed active prerequisite edges forming the DAG */
  activeEdges: NormalizedGraphEdge[];
  /** Removed edges with their respective drop reasons */
  removedEdges: NormalizedGraphEdge[];
  /** All edges including removed ones, suitable for persistence */
  allEdges: NormalizedGraphEdge[];
  /** Map of concept ID -> depth tier (0 = foundational, 1 = core, 2+ = advanced) */
  tiers: Map<string, number>;
  /** Map of concept ID -> downstream influence in [0, 1] */
  downstreamInfluence: Map<string, number>;
  /** Graph mode: 'dag' or 'fallback_linear' */
  graphMode: GraphMode;
  /** Comprehensive diagnostics for graph inspection */
  diagnostics: GraphDiagnostics;
}
