/**
 * Study Path Header
 * Displays view toggles, document title, and honest progress counts (no leaderboards).
 * Source of truth: DESIGN_DOC §5.3.C, PRD FR-05
 */

import React from 'react';
import { List, Network, Sparkles, Clock, RefreshCw, CheckCircle2, Lock } from 'lucide-react';

export type PathViewMode = 'list' | 'graph';

export interface StatusCounts {
  locked: number;
  available: number;
  in_progress: number;
  review_due: number;
  mastered: number;
  total: number;
}

interface PathHeaderProps {
  documentTitle: string;
  viewMode: PathViewMode;
  onViewModeChange: (mode: PathViewMode) => void;
  statusCounts: StatusCounts;
}

export function PathHeader({
  documentTitle,
  viewMode,
  onViewModeChange,
  statusCounts,
}: PathHeaderProps) {
  return (
    <header className="border-b border-border-subtle bg-surface-subtle/50 px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-accent-cyan">
            <span>STUDY PATH</span>
            <span aria-hidden="true">•</span>
            <span>PREREQUISITE DAG</span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-text-primary sm:text-2xl">
            {documentTitle || 'Knowledge Path'}
          </h1>
        </div>

        {/* View Mode Toggle */}
        <div
          role="group"
          aria-label="Study path view modes"
          className="inline-flex items-center rounded-lg border border-border-subtle bg-surface-elevated p-1"
        >
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            aria-pressed={viewMode === 'list'}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-accent-violet text-white shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <List className="h-4 w-4" aria-hidden="true" />
            <span>List View</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('graph')}
            aria-pressed={viewMode === 'graph'}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === 'graph'
                ? 'bg-accent-violet text-white shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Network className="h-4 w-4" aria-hidden="true" />
            <span>Graph View</span>
          </button>
        </div>
      </div>

      {/* Progress Summary: Honest counts per status, without comparison or leaderboards */}
      <section
        aria-label="Progress summary"
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"
      >
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card p-2 text-xs">
          <Sparkles className="h-4 w-4 text-accent-cyan" aria-hidden="true" />
          <div>
            <span className="font-semibold text-text-primary">{statusCounts.available}</span>
            <span className="ml-1 text-text-muted">Available</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card p-2 text-xs">
          <Clock className="h-4 w-4 text-accent-violet" aria-hidden="true" />
          <div>
            <span className="font-semibold text-text-primary">{statusCounts.in_progress}</span>
            <span className="ml-1 text-text-muted">In Progress</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card p-2 text-xs">
          <RefreshCw className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <div>
            <span className="font-semibold text-text-primary">{statusCounts.review_due}</span>
            <span className="ml-1 text-text-muted">Review Due</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card p-2 text-xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          <div>
            <span className="font-semibold text-text-primary">{statusCounts.mastered}</span>
            <span className="ml-1 text-text-muted">Mastered</span>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card p-2 text-xs">
          <Lock className="h-4 w-4 text-text-muted" aria-hidden="true" />
          <div>
            <span className="font-semibold text-text-primary">{statusCounts.locked}</span>
            <span className="ml-1 text-text-muted">Locked</span>
          </div>
        </div>
      </section>
    </header>
  );
}
