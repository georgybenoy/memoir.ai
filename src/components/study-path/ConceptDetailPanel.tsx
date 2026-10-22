/**
 * Concept Detail Panel
 * Right rail on desktop, bottom sheet / drawer on mobile.
 * Displays summary, key terms, prerequisites, dependents, source excerpts with provenance,
 * and "Learn this concept" / explicit "Skip prerequisites" actions.
 * Source of truth: DESIGN_DOC §5.3.C, PRD FR-04, FR-05
 */

import React, { useState } from 'react';
import {
  type ConceptRecord,
  type DocumentChunkRecord,
} from '@/types/domain';
import { ConceptStatusBadge } from './ConceptStatusBadge';
import {
  X,
  BookOpen,
  Lock,
  Unlock,
  FileText,
  Tag,
  AlertTriangle,
} from 'lucide-react';

export interface ConceptDetailPanelProps {
  concept: ConceptRecord | null;
  prerequisites: ConceptRecord[];
  dependents: ConceptRecord[];
  sourceChunks: DocumentChunkRecord[];
  downstreamInfluence?: number;
  onSelectConcept: (conceptId: string) => void;
  onLearnConcept: (conceptId: string) => void;
  onSkipPrerequisites: (conceptId: string) => void;
  onClose: () => void;
}

export function ConceptDetailPanel({
  concept,
  prerequisites,
  dependents,
  sourceChunks,
  downstreamInfluence = 0,
  onSelectConcept,
  onLearnConcept,
  onSkipPrerequisites,
  onClose,
}: ConceptDetailPanelProps) {
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  if (!concept) {
    return (
      <aside
        aria-label="Concept details panel"
        className="flex h-full w-full flex-col items-center justify-center p-8 text-center text-text-muted"
      >
        <BookOpen className="h-10 w-10 text-text-subtle mb-3" aria-hidden="true" />
        <p className="text-sm">Select a concept from the list or graph to inspect details, prerequisites, and source notes.</p>
      </aside>
    );
  }

  const isLocked = concept.status === 'locked';

  const handleConfirmSkip = () => {
    onSkipPrerequisites(concept.id);
    setShowSkipConfirm(false);
  };

  return (
    <aside
      aria-label={`Details for ${concept.title}`}
      className="flex h-full w-full flex-col overflow-y-auto border-l border-border-subtle bg-surface-card/60 backdrop-blur"
    >
      {/* Panel Header */}
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border-subtle bg-surface-elevated/95 p-4 sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-surface-subtle px-2 py-0.5 text-xs font-semibold uppercase text-accent-cyan">
              Tier {concept.tier ?? 0}
            </span>
            <ConceptStatusBadge status={concept.status} size="sm" />
          </div>
          <h2 className="mt-2 text-lg font-bold text-text-primary">
            {concept.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-text-muted hover:bg-surface-card hover:text-text-primary"
          aria-label="Close concept details panel"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6 p-4 sm:p-5">
        {/* Primary Action Button */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={isLocked}
            onClick={() => onLearnConcept(concept.id)}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-semibold transition-all shadow-sm ${
              isLocked
                ? 'cursor-not-allowed bg-surface-elevated/80 text-text-muted border border-border-subtle'
                : 'bg-accent-violet text-white hover:bg-accent-violet-hover active:scale-95'
            }`}
          >
            {isLocked ? (
              <>
                <Lock className="h-4 w-4" aria-hidden="true" />
                <span>Locked by Prerequisites</span>
              </>
            ) : (
              <>
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span>Learn this concept</span>
              </>
            )}
          </button>

          {/* Locked Reason & Skip Override Action */}
          {isLocked && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
              <div className="flex items-start gap-2 text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-medium">Prerequisites not met</p>
                  <p className="mt-0.5 text-text-muted">
                    Complete direct prerequisites to 60% mastery before advancing.
                  </p>
                </div>
              </div>

              {!showSkipConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowSkipConfirm(true)}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-cyan hover:underline"
                >
                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Override & skip prerequisites</span>
                </button>
              ) : (
                <div className="mt-3 rounded border border-border-subtle bg-surface-card p-2.5 space-y-2">
                  <p className="text-[11px] text-text-muted">
                    Explicitly skipping prerequisites logs a learning event and unlocks this concept immediately.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmSkip}
                      className="rounded bg-amber-500 px-2.5 py-1 text-xs font-semibold text-black hover:bg-amber-400"
                    >
                      Confirm Skip
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSkipConfirm(false)}
                      className="rounded border border-border-subtle px-2.5 py-1 text-xs text-text-muted hover:text-text-primary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <section aria-labelledby="section-summary" className="space-y-1.5">
          <h3 id="section-summary" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Summary
          </h3>
          <p className="text-xs leading-relaxed text-text-primary">
            {concept.summary}
          </p>
        </section>

        {/* Canonical Explanation */}
        {concept.canonicalExplanation && (
          <section aria-labelledby="section-canonical" className="space-y-1.5">
            <h3 id="section-canonical" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Canonical Explanation
            </h3>
            <div className="rounded-lg border border-border-subtle bg-surface-subtle/50 p-3 text-xs leading-relaxed text-text-muted">
              {concept.canonicalExplanation}
            </div>
          </section>
        )}

        {/* Key Terms */}
        {concept.keyTerms && concept.keyTerms.length > 0 && (
          <section aria-labelledby="section-terms" className="space-y-2">
            <h3 id="section-terms" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Key Terms
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {concept.keyTerms.map((term, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-elevated px-2 py-0.5 text-xs text-text-primary"
                >
                  <Tag className="h-3 w-3 text-text-muted" aria-hidden="true" />
                  <span>{term}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Downstream Influence */}
        <section aria-labelledby="section-influence" className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span id="section-influence" className="font-semibold uppercase tracking-wider text-text-muted">
              Downstream Influence
            </span>
            <span className="font-mono text-text-primary">
              {Math.round(downstreamInfluence * 100)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full bg-accent-violet transition-all duration-300"
              style={{ width: `${Math.round(downstreamInfluence * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-text-muted">
            {downstreamInfluence > 0.5
              ? 'Foundational concept: unlocks multiple subsequent topics.'
              : 'Specialized topic or near leaf in prerequisite tree.'}
          </p>
        </section>

        {/* Prerequisites */}
        <section aria-labelledby="section-prereqs" className="space-y-2">
          <h3 id="section-prereqs" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Prerequisites ({prerequisites.length})
          </h3>
          {prerequisites.length === 0 ? (
            <p className="text-xs text-text-muted">
              None. This is a foundational Tier 0 primitive.
            </p>
          ) : (
            <ul className="space-y-1.5" role="list">
              {prerequisites.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConcept(p.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-surface-elevated/40 p-2.5 text-left text-xs hover:border-border-default hover:bg-surface-elevated transition-colors"
                  >
                    <span className="font-medium text-text-primary">{p.title}</span>
                    <ConceptStatusBadge status={p.status} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Dependents */}
        <section aria-labelledby="section-dependents" className="space-y-2">
          <h3 id="section-dependents" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Enables Next ({dependents.length})
          </h3>
          {dependents.length === 0 ? (
            <p className="text-xs text-text-muted">
              No further concepts currently depend directly on this topic.
            </p>
          ) : (
            <ul className="space-y-1.5" role="list">
              {dependents.map((dep) => (
                <li key={dep.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConcept(dep.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-surface-elevated/40 p-2.5 text-left text-xs hover:border-border-default hover:bg-surface-elevated transition-colors"
                  >
                    <span className="font-medium text-text-primary">{dep.title}</span>
                    <ConceptStatusBadge status={dep.status} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Source Note Provenance Excerpts */}
        <section aria-labelledby="section-provenance" className="space-y-2">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-accent-cyan" aria-hidden="true" />
            <h3 id="section-provenance" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Source Note Provenance ({sourceChunks.length})
            </h3>
          </div>
          {sourceChunks.length === 0 ? (
            <p className="text-xs text-text-muted">
              No source chunks linked. (Topic mode or unlinked concept)
            </p>
          ) : (
            <div className="space-y-2">
              {sourceChunks.map((chunk) => (
                <div
                  key={chunk.id}
                  className="rounded-lg border border-border-subtle bg-surface-card p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-text-subtle mb-1.5 font-mono">
                    <span>
                      {chunk.pageStart
                        ? `Page ${chunk.pageStart}${chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `–${chunk.pageEnd}` : ''}`
                        : `Chunk #${chunk.chunkIndex + 1}`}
                    </span>
                    {chunk.headingPath && chunk.headingPath.length > 0 && (
                      <span className="truncate max-w-[180px]">
                        {chunk.headingPath.join(' › ')}
                      </span>
                    )}
                  </div>
                  <blockquote className="border-l-2 border-accent-cyan/40 pl-2.5 text-text-muted italic line-clamp-4">
                    “{chunk.text}”
                  </blockquote>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
