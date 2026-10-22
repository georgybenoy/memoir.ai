/**
 * Path List / Tree View
 * Default accessible representation of the prerequisite study path.
 * Grouped by depth tiers with accessible keyboard navigation and plain-language locked reasons.
 * Source of truth: DESIGN_DOC §5.3.C, PRD FR-04, FR-05
 */

import React from 'react';
import { type ConceptRecord } from '@/types/domain';
import { ConceptStatusBadge } from './ConceptStatusBadge';
import { BookOpen, ChevronRight, Lock, Layers } from 'lucide-react';

export interface PathListViewProps {
  concepts: ConceptRecord[];
  prerequisitesMap: Map<string, ConceptRecord[]>;
  selectedConceptId: string | null;
  onSelectConcept: (conceptId: string) => void;
  onLearnConcept: (conceptId: string) => void;
}

const TIER_LABELS: Record<number, { title: string; subtitle: string }> = {
  0: {
    title: 'Tier 0 — Foundational Primitives',
    subtitle: 'Core building blocks with no required prerequisites. Start here to build intuition.',
  },
  1: {
    title: 'Tier 1 — Core Mechanisms',
    subtitle: 'Fundamental systems and mechanics that connect foundational primitives.',
  },
  2: {
    title: 'Tier 2+ — Advanced Concepts',
    subtitle: 'Higher-order synthesis and specialized topics built upon core mechanisms.',
  },
};

export function PathListView({
  concepts,
  prerequisitesMap,
  selectedConceptId,
  onSelectConcept,
  onLearnConcept,
}: PathListViewProps) {
  // Group concepts by tier
  const tiersMap = new Map<number, ConceptRecord[]>();
  for (const c of concepts) {
    const tier = c.tier ?? 0;
    if (!tiersMap.has(tier)) {
      tiersMap.set(tier, []);
    }
    tiersMap.get(tier)!.push(c);
  }

  const sortedTiers = Array.from(tiersMap.keys()).sort((a, b) => a - b);

  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-sm text-text-muted">No concepts found in this study path.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 sm:p-6" role="region" aria-label="Study Path by Tier">
      {sortedTiers.map((tier) => {
        const tierConcepts = tiersMap.get(tier)!;
        const tierInfo =
          tier >= 2
            ? TIER_LABELS[2]
            : TIER_LABELS[tier] ?? {
                title: `Tier ${tier}`,
                subtitle: 'Ordered learning tier.',
              };

        return (
          <section
            key={tier}
            aria-labelledby={`tier-heading-${tier}`}
            className="space-y-3"
          >
            {/* Tier Group Header */}
            <div className="border-b border-border-subtle pb-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-accent-cyan" aria-hidden="true" />
                <h2
                  id={`tier-heading-${tier}`}
                  className="text-base font-semibold text-text-primary"
                >
                  {tierInfo.title}
                </h2>
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
                  {tierConcepts.length} concept{tierConcepts.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-text-muted">{tierInfo.subtitle}</p>
            </div>

            {/* Concept List for this Tier */}
            <ul className="space-y-2.5" role="list">
              {tierConcepts.map((concept) => {
                const isSelected = selectedConceptId === concept.id;
                const isLocked = concept.status === 'locked';
                const prereqs = prerequisitesMap.get(concept.id) ?? [];
                const unmetPrereqs = prereqs.filter((p) => p.status !== 'mastered');

                // Plain-language locked reason
                const lockedReason = isLocked
                  ? unmetPrereqs.length > 0
                    ? `Locked: Must master ${unmetPrereqs.map((p) => `"${p.title}"`).join(', ')} first.`
                    : 'Locked: Prerequisite mastery threshold not met.'
                  : '';

                return (
                  <li key={concept.id}>
                    <article
                      tabIndex={0}
                      onClick={() => onSelectConcept(concept.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectConcept(concept.id);
                        }
                      }}
                      className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all sm:flex-row sm:items-center ${
                        isSelected
                          ? 'border-accent-violet bg-surface-card/90 shadow-md ring-1 ring-accent-violet'
                          : 'border-border-subtle bg-surface-card/40 hover:border-border-default hover:bg-surface-card/70'
                      }`}
                      aria-label={`${concept.title}, Status: ${concept.status}`}
                    >
                      {/* Left: Concept Info */}
                      <div className="flex-1 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent-cyan transition-colors">
                            {concept.title}
                          </h3>
                          <ConceptStatusBadge status={concept.status} size="sm" />
                        </div>

                        <p className="mt-1 line-clamp-2 text-xs text-text-muted">
                          {concept.summary}
                        </p>

                        {/* Prerequisite Indicators */}
                        {prereqs.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                            <span className="text-[11px] font-medium text-text-subtle">
                              Requires:
                            </span>
                            {prereqs.map((prereq) => (
                              <span
                                key={prereq.id}
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                                  prereq.status === 'mastered'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-surface-elevated text-text-muted'
                                }`}
                              >
                                {prereq.title}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="mt-3 flex items-center justify-between gap-3 sm:mt-0 sm:justify-end">
                        <button
                          type="button"
                          id={`learn-btn-${concept.id}`}
                          disabled={isLocked}
                          aria-describedby={isLocked ? `locked-reason-${concept.id}` : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            onLearnConcept(concept.id);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
                            isLocked
                              ? 'cursor-not-allowed border border-border-subtle bg-surface-elevated/40 text-text-subtle'
                              : 'bg-accent-violet text-white hover:bg-accent-violet-hover shadow-sm active:scale-95'
                          }`}
                        >
                          {isLocked ? (
                            <>
                              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Locked</span>
                            </>
                          ) : (
                            <>
                              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Learn this concept</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectConcept(concept.id);
                          }}
                          className="rounded-lg p-2 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                          aria-label={`View details for ${concept.title}`}
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      {/* Screen reader only locked reason */}
                      {isLocked && (
                        <span id={`locked-reason-${concept.id}`} className="sr-only">
                          {lockedReason}
                        </span>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
