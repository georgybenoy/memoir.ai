'use client';

import * as React from 'react';
import {
  Layers,
  FileText,
  Globe,
  ChevronDown,
  ChevronUp,
  Award,
  Link as LinkIcon,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  type ConceptRecord,
  type DocumentRecord,
  type DocumentChunkRecord,
  type MasteryStateRecord,
} from '@/types/domain';
import { getChunkExcerpt } from '@/features/ingestion/provenance';
import { cn } from '@/lib/utils/cn';

export interface PrerequisiteStatus {
  id: string;
  title: string;
  status: 'mastered' | 'available' | 'locked';
}

export interface SessionSidebarProps {
  concept: ConceptRecord | null;
  document: DocumentRecord | null;
  sourceChunks: DocumentChunkRecord[];
  prerequisites?: PrerequisiteStatus[];
  mastery?: MasteryStateRecord | null;
  sourceMode?: 'document' | 'topic';
  className?: string;
}

export function SessionSidebar({
  concept,
  document,
  sourceChunks,
  prerequisites = [],
  mastery,
  sourceMode = 'document',
  className,
}: SessionSidebarProps) {
  const [showExcerpt, setShowExcerpt] = React.useState(false);
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  const primaryChunk = sourceChunks.length > 0 ? sourceChunks[0] : null;
  const sourceExcerpt =
    document && primaryChunk ? getChunkExcerpt(document, primaryChunk, 260) : null;

  const isDocumentMode = sourceMode === 'document';
  const tierLabel =
    concept?.tier === 0
      ? 'Foundational'
      : concept?.tier === 1
        ? 'Core Mechanism'
        : 'Advanced Concept';

  return (
    <aside
      aria-label="Concept context and grounding"
      className={cn('space-y-4', className)}
    >
      {/* Mobile Toggle Button (< 1024px) */}
      <div className="lg:hidden">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsMobileOpen((prev) => !prev)}
          className="w-full flex items-center justify-between text-xs py-2.5 px-4 bg-[var(--surface)] border-[var(--border-color)]"
          aria-expanded={isMobileOpen}
          aria-controls="session-sidebar-content"
        >
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
            <span className="font-semibold text-[var(--text-primary)]">
              {concept ? `Concept Details: ${concept.title}` : 'Concept Details'}
            </span>
          </div>
          {isMobileOpen ? (
            <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Main Sidebar Body */}
      <div
        id="session-sidebar-content"
        className={cn(
          'space-y-4 transition-all duration-200',
          !isMobileOpen && 'hidden lg:block',
        )}
      >
        {/* Card 1: Active Concept Overview & Key Terms */}
        <Card className="border-[var(--border-color)] bg-[var(--surface)] rounded-2xl shadow-xs overflow-hidden">
          <CardHeader className="pb-3 border-b border-[var(--border-color)]/60 bg-[var(--surface-raised)]/30">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Concept Overview
              </span>
              {concept && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--primary)]/15 text-[var(--text-primary)] border border-[var(--primary)]/30">
                  <Layers className="h-3 w-3" aria-hidden="true" />
                  <span>Tier {concept.tier}: {tierLabel}</span>
                </span>
              )}
            </div>
            <CardTitle className="text-base font-bold text-[var(--text-primary)] pt-1">
              {concept?.title ?? 'No Active Concept'}
            </CardTitle>
          </CardHeader>

          <CardContent className="pt-4 space-y-3.5 text-xs text-[var(--text-secondary)]">
            {concept?.summary && (
              <p className="leading-relaxed line-clamp-4 text-[var(--text-secondary)]">
                {concept.summary}
              </p>
            )}

            {concept?.keyTerms && concept.keyTerms.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-[var(--border-color)]/60">
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                  Key Vocabulary:
                </span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {concept.keyTerms.map((term, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md text-[11px] bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--text-primary)] font-medium"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Source Grounding & Provenance */}
        <Card className="border-[var(--border-color)] bg-[var(--surface)] rounded-2xl shadow-xs">
          <CardHeader className="pb-3 border-b border-[var(--border-color)]/60">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Source Grounding
              </span>
              {isDocumentMode ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--accent-green)]/15 text-[var(--accent-green)] border border-[var(--accent-green)]/30">
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  <span>Note-Grounded</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/30">
                  <Globe className="h-3 w-3" aria-hidden="true" />
                  <span>Topic Mode</span>
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-3 text-xs">
            {isDocumentMode ? (
              <>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span className="text-[var(--text-muted)]">Source Document:</span>
                  <span
                    className="font-medium text-[var(--text-primary)] truncate max-w-[180px]"
                    title={document?.filename}
                  >
                    {document?.filename ?? 'Imported Study Material'}
                  </span>
                </div>

                {primaryChunk?.pageStart && (
                  <div className="flex items-center justify-between text-[var(--text-secondary)]">
                    <span className="text-[var(--text-muted)]">Page Reference:</span>
                    <span className="font-medium text-[var(--text-primary)] font-mono">
                      Page {primaryChunk.pageStart}
                      {primaryChunk.pageEnd && primaryChunk.pageEnd !== primaryChunk.pageStart
                        ? `–${primaryChunk.pageEnd}`
                        : ''}
                    </span>
                  </div>
                )}

                {sourceExcerpt && (
                  <div className="pt-2 border-t border-[var(--border-color)]/60 space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowExcerpt((prev) => !prev)}
                      className="w-full flex items-center justify-between text-[11px] font-semibold text-[var(--text-primary)] hover:underline focus:outline-none"
                      aria-expanded={showExcerpt}
                    >
                      <span>Inspect Source Text Excerpt</span>
                      {showExcerpt ? (
                        <ChevronUp className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                      )}
                    </button>

                    {showExcerpt && (
                      <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] italic leading-relaxed">
                        &ldquo;{sourceExcerpt.fullExcerpt}&rdquo;
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-[var(--warning)] leading-relaxed">
                This session runs in Topic mode and is generated from general domain knowledge rather than imported study notes.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Prerequisites & Pedagogy Roadmap */}
        {prerequisites.length > 0 && (
          <Card className="border-[var(--border-color)] bg-[var(--surface)] rounded-2xl shadow-xs">
            <CardHeader className="pb-3 border-b border-[var(--border-color)]/60">
              <div className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-[var(--accent-blue)]" aria-hidden="true" />
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Prerequisites ({prerequisites.length})
                </span>
              </div>
            </CardHeader>

            <CardContent className="pt-3 divide-y divide-[var(--border-color)]/50 text-xs">
              {prerequisites.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--text-primary)] truncate max-w-[190px]">
                    {p.title}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0',
                      p.status === 'mastered' &&
                        'bg-[var(--accent-green)]/15 text-[var(--accent-green)] border-[var(--accent-green)]/30',
                      p.status === 'available' &&
                        'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] border-[var(--accent-blue)]/30',
                      p.status === 'locked' &&
                        'bg-[var(--surface-raised)] text-[var(--text-muted)] border-[var(--border-color)]',
                    )}
                  >
                    {p.status === 'mastered' && <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />}
                    {p.status === 'locked' && <Lock className="h-2.5 w-2.5" aria-hidden="true" />}
                    <span className="capitalize">{p.status}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Card 4: Real Mastery Information (Honest: hidden when unknown) */}
        {mastery && mastery.attemptCount > 0 && (
          <Card className="border-[var(--border-color)] bg-[var(--surface)] rounded-2xl shadow-xs">
            <CardHeader className="pb-3 border-b border-[var(--border-color)]/60">
              <div className="flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-[var(--accent-cyan)]" aria-hidden="true" />
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Verified Mastery
                </span>
              </div>
            </CardHeader>

            <CardContent className="pt-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Mastery Level:</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  Level {mastery.level} / 4
                </span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Best Retention Score:</span>
                <span className="font-mono font-semibold text-[var(--accent-cyan)]">
                  {mastery.bestScore} / 100
                </span>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>Evaluated Attempts:</span>
                <span className="font-mono text-[var(--text-muted)]">
                  {mastery.attemptCount} {mastery.attemptCount === 1 ? 'attempt' : 'attempts'}
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </aside>
  );
}
