/**
 * Tarjan's Strongly Connected Components (SCC) Algorithm
 * Used for deterministic cycle detection in directed prerequisite graphs.
 * Pure TypeScript, zero external dependencies.
 * Source of truth: PRD FR-04, TECH_STACK §9.1
 */

export interface TarjanInputEdge {
  prerequisiteId: string;
  dependentConceptId: string;
}

/**
 * Finds all Strongly Connected Components (SCCs) in a directed graph using Tarjan's algorithm.
 * Deterministic node ordering ensures identical output across identical inputs.
 *
 * @param nodeIds Set or array of all valid node IDs in the graph
 * @param edges Directed edges where edge.prerequisiteId -> edge.dependentConceptId
 * @returns Array of SCCs, where each SCC is an array of node IDs
 */
export function findStronglyConnectedComponents(
  nodeIds: Iterable<string>,
  edges: TarjanInputEdge[],
): string[][] {
  // Sort node IDs to guarantee deterministic traversal order regardless of input set ordering
  const sortedNodes = Array.from(nodeIds).sort();

  // Build adjacency list: prerequisiteId -> list of dependentConceptIds
  const adj = new Map<string, string[]>();
  for (const id of sortedNodes) {
    adj.set(id, []);
  }
  for (const edge of edges) {
    if (adj.has(edge.prerequisiteId) && adj.has(edge.dependentConceptId)) {
      adj.get(edge.prerequisiteId)!.push(edge.dependentConceptId);
    }
  }

  // Sort adjacency lists for stable traversal
  for (const neighbors of adj.values()) {
    neighbors.sort();
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongConnect(u: string): void {
    indices.set(u, index);
    lowlinks.set(u, index);
    index++;
    stack.push(u);
    onStack.add(u);

    const neighbors = adj.get(u) ?? [];
    for (const v of neighbors) {
      if (!indices.has(v)) {
        // v has not yet been visited; recurse on it
        strongConnect(v);
        lowlinks.set(u, Math.min(lowlinks.get(u)!, lowlinks.get(v)!));
      } else if (onStack.has(v)) {
        // v is on the current stack and in the current SCC
        lowlinks.set(u, Math.min(lowlinks.get(u)!, indices.get(v)!));
      }
    }

    // If u is a root node, pop the stack and generate an SCC
    if (lowlinks.get(u) === indices.get(u)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== u);

      // Sort nodes within the SCC for determinism
      scc.sort();
      sccs.push(scc);
    }
  }

  for (const node of sortedNodes) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  return sccs;
}

/**
 * Checks whether an SCC contains a cycle.
 * For an SCC with > 1 node, it is always cyclic.
 * For an SCC with 1 node, it is cyclic only if it contains a self-loop.
 */
export function isCyclicScc(scc: string[], edges: TarjanInputEdge[]): boolean {
  if (scc.length > 1) {
    return true;
  }
  if (scc.length === 1) {
    const singleNode = scc[0];
    return edges.some(
      (e) => e.prerequisiteId === singleNode && e.dependentConceptId === singleNode,
    );
  }
  return false;
}
