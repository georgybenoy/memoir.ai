'use client';

import * as React from 'react';
import { type ConceptRecord } from '@/types/domain';
import { type MachineState } from '@/features/conversation/types';
import { Sparkles, FileText, Globe, Layers } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { TeacherAvatar, mapStateToAvatarExpression } from '@/components/avatar';

export interface TutorHeaderProps {
  concept: ConceptRecord | null;
  machineState: MachineState;
  qualityGrade?: number | null;
  sourceMode?: 'document' | 'topic';
  documentName?: string;
}

function getStateLabel(state: MachineState): { label: string; badgeClass: string } {
  switch (state) {
    case 'STUDYING_CONCEPT':
      return {
        label: 'Studying Concept',
        badgeClass: 'bg-[var(--primary)]/15 text-[var(--primary)] border-[var(--primary)]/30',
      };
    case 'WAITING_FOR_RECALL':
      return {
        label: 'Ready for Recall',
        badgeClass: 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/30',
      };
    case 'GENERATING_QUESTION':
      return {
        label: 'Generating Question…',
        badgeClass: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30 animate-pulse',
      };
    case 'WAITING_FOR_ANSWER':
      return {
        label: 'Question Active',
        badgeClass: 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30',
      };
    case 'EVALUATING':
      return {
        label: 'Evaluating Answer…',
        badgeClass: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30 animate-pulse',
      };
    case 'FEEDBACK':
      return {
        label: 'Feedback & Review',
        badgeClass: 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30',
      };
    case 'NEXT_CONCEPT':
      return {
        label: 'Concept Completed',
        badgeClass: 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30',
      };
    case 'REVISION_DUE':
      return {
        label: 'Revision Recommended',
        badgeClass: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30',
      };
    case 'COMPLETED':
      return {
        label: 'Study Path Completed',
        badgeClass: 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/30',
      };
    default:
      return {
        label: state,
        badgeClass: 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border-color)]',
      };
  }
}

export const TutorHeader: React.FC<TutorHeaderProps> = ({
  concept,
  machineState,
  qualityGrade,
  sourceMode = 'document',
  documentName,
}) => {
  const { label: stateLabel, badgeClass } = getStateLabel(machineState);
  const isDocumentMode = sourceMode === 'document';
  const expression = mapStateToAvatarExpression({
    machineState,
    qualityGrade: qualityGrade ?? null,
  });

  const tierLabel =
    concept?.tier === 0
      ? 'Foundational'
      : concept?.tier === 1
        ? 'Core Mechanism'
        : 'Advanced Concept';

  return (
    <header
      aria-label="Tutor session header"
      className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface)]/90 backdrop-blur-xs space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <TeacherAvatar expression={expression} size="lg" showBadge />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                  badgeClass,
                )}
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                <span>{stateLabel}</span>
              </span>

              {concept && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                  <Layers className="h-3 w-3" aria-hidden="true" />
                  <span>Tier {concept.tier}: {tierLabel}</span>
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {concept ? concept.title : 'Study Companion'}
            </h1>
          </div>
        </div>

        {/* Source Grounding Badge */}
        <div className="flex items-center gap-2">
          {isDocumentMode ? (
            <div
              title={documentName ? `Grounded in ${documentName}` : 'Grounded in uploaded study notes'}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Grounded in notes</span>
              {documentName && (
                <span className="hidden md:inline font-mono text-[10px] opacity-80 max-w-[150px] truncate">
                  ({documentName})
                </span>
              )}
            </div>
          ) : (
            <div
              title="Not based on uploaded notes"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/30"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Topic mode (Not based on notes)</span>
            </div>
          )}
        </div>
      </div>

      {/* Screen reader live region for state transitions */}
      <div role="status" aria-live="polite" className="sr-only">
        Active learning state: {stateLabel}. Current concept: {concept?.title ?? 'None'}.
      </div>
    </header>
  );
};
