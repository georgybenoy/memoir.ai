/**
 * Path Diagnostics Component
 * Collapsible section detailing graph mode (DAG vs fallback_linear) and removed edges.
 * Source of truth: DESIGN_DOC §5.3.C, PRD FR-04
 */

import React, { useState } from 'react';
import { type NormalizedGraphEdge, type GraphMode } from '@/features/dependency-graph';
import { ChevronDown, ChevronRight, Activity, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export interface PathDiagnosticsProps {
  graphMode: GraphMode;
  fallbackReason?: string;
  activeEdgesCount: number;
  removedEdges: NormalizedGraphEdge[];
  cyclesDetectedCount?: number;
}

export function PathDiagnostics({
  graphMode,
  fallbackReason,
  activeEdgesCount,
  removedEdges,
  cyclesDetectedCount = 0,
}: PathDiagnosticsProps) {
  const [isOpen, setIsOpen] = useState(graphMode === 'fallback_linear' || removedEdges.length > 0);

  const isFallback = graphMode === 'fallback_linear';

  return (
    <div className="border-t border-border-subtle bg-surface-subtle/30 px-4 py-3 sm:px-6">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="path-diagnostics-content"
        className="flex w-full items-center justify-between text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent-cyan" aria-hidden="true" />
          <span>Graph & Pipeline Diagnostics</span>
          {isFallback ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Approximate Linear Order
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">
              <CheckCircle className="h-3 w-3" aria-hidden="true" />
              Verified DAG
            </span>
          )}
          {removedEdges.length > 0 && (
            <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[11px] text-text-muted">
              {removedEdges.length} pruned edge{removedEdges.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div id="path-diagnostics-content" className="mt-3 space-y-3 pt-3 border-t border-border-subtle/60 text-xs">
          {/* Approximate Order Banner */}
          {isFallback && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300">
              <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold">Approximate Ordering Notice</p>
                <p className="mt-0.5 text-xs text-amber-200/90">
                  {fallbackReason ||
                    'Graph prerequisite extraction encountered ambiguities. Concepts are ordered by source note position rather than strict prerequisites.'}
                </p>
              </div>
            </div>
          )}

          {/* Graph Metrics */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 font-mono text-[11px]">
            <div className="rounded border border-border-subtle bg-surface-card p-2">
              <span className="text-text-subtle">Mode:</span>{' '}
              <span className="text-text-primary font-bold">{graphMode}</span>
            </div>
            <div className="rounded border border-border-subtle bg-surface-card p-2">
              <span className="text-text-subtle">Active Edges:</span>{' '}
              <span className="text-text-primary font-bold">{activeEdgesCount}</span>
            </div>
            <div className="rounded border border-border-subtle bg-surface-card p-2">
              <span className="text-text-subtle">Cycles Resolved:</span>{' '}
              <span className="text-text-primary font-bold">{cyclesDetectedCount}</span>
            </div>
            <div className="rounded border border-border-subtle bg-surface-card p-2">
              <span className="text-text-subtle">Pruned Edges:</span>{' '}
              <span className="text-text-primary font-bold">{removedEdges.length}</span>
            </div>
          </div>

          {/* Pruned Edges Table */}
          {removedEdges.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="font-semibold uppercase tracking-wider text-[11px] text-text-subtle">
                Pruned / Resolved Edges
              </h4>
              <div className="max-h-40 overflow-y-auto rounded border border-border-subtle bg-surface-card text-[11px]">
                <table className="w-full text-left">
                  <thead className="border-b border-border-subtle bg-surface-elevated text-text-subtle">
                    <tr>
                      <th className="p-2 font-medium">Relationship</th>
                      <th className="p-2 font-medium">Confidence</th>
                      <th className="p-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle font-mono">
                    {removedEdges.map((edge) => (
                      <tr key={edge.id} className="hover:bg-surface-elevated/40">
                        <td className="p-2 truncate max-w-[140px]">
                          {edge.prerequisiteId} → {edge.dependentConceptId}
                        </td>
                        <td className="p-2">{Math.round(edge.confidence * 100)}%</td>
                        <td className="p-2 text-text-muted capitalize">
                          {edge.removedReason?.replace('_', ' ') || 'Pruned'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
