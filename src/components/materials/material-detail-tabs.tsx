'use client';

import * as React from 'react';
import {
  Sparkles,
  Network,
  Layers,
  CheckCircle2,
  ShieldAlert,
  Tag,
  Quote,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import {
  type DocumentRecord,
  type DocumentChunkRecord,
  type ConceptRecord,
  type LearningUnitRecord,
} from '@/types/domain';
import { verifyChunkProvenance } from '@/features/ingestion';

export interface MaterialDetailTabsProps {
  selectedDoc: DocumentRecord;
  selectedDocChunks: DocumentChunkRecord[];
  extractedConcepts: ConceptRecord[];
  selectedDocUnits: LearningUnitRecord[];
  loadingChunks: boolean;
  previewTab: 'text' | 'chunks' | 'concepts' | 'units';
  setPreviewTab: (tab: 'text' | 'chunks' | 'concepts' | 'units') => void;
  onAnalyzeNotes: () => void;
  isAnalyzing: boolean;
  onOpenExcerpt: (concept: ConceptRecord, chunkId: string) => void;
}

export function MaterialDetailTabs({
  selectedDoc,
  selectedDocChunks,
  extractedConcepts,
  selectedDocUnits,
  loadingChunks,
  previewTab,
  setPreviewTab,
  onAnalyzeNotes,
  isAnalyzing,
  onOpenExcerpt,
}: MaterialDetailTabsProps) {
  return (
    <div className="space-y-4">
      {/* Tabs Navigation */}
      <div className="border-b border-[var(--border-color)] flex gap-4 text-sm overflow-x-auto">
        <button
          type="button"
          onClick={() => setPreviewTab('text')}
          className={cn(
            'pb-2 font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap',
            previewTab === 'text'
              ? 'border-[var(--primary)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
          )}
        >
          Extracted Text ({selectedDoc.extractedText.length.toLocaleString()} chars)
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('chunks')}
          className={cn(
            'pb-2 font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap',
            previewTab === 'chunks'
              ? 'border-[var(--primary)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
          )}
        >
          Study Chunks ({selectedDocChunks.length})
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('concepts')}
          className={cn(
            'pb-2 font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap',
            previewTab === 'concepts'
              ? 'border-[var(--primary)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
          )}
        >
          <Network className="h-3.5 w-3.5" />
          <span>Extracted Concepts ({extractedConcepts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setPreviewTab('units')}
          className={cn(
            'pb-2 font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap',
            previewTab === 'units'
              ? 'border-[var(--primary)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Learning Units ({selectedDocUnits.length})</span>
        </button>
      </div>

      {/* Tab 1: Full Extracted Text View */}
      {previewTab === 'text' && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div
              tabIndex={0}
              aria-label="Normalized extracted text preview"
              className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-xs sm:text-sm leading-relaxed text-[var(--text-secondary)] bg-[var(--surface)] p-4 rounded-lg border border-[var(--border-color)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] select-text"
            >
              {selectedDoc.extractedText || 'No text extracted.'}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Study Chunks View */}
      {previewTab === 'chunks' && (
        <div className="space-y-3">
          {loadingChunks ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading chunks...</div>
          ) : selectedDocChunks.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              No chunks generated for this material.
            </div>
          ) : (
            selectedDocChunks.map((chunk) => {
              const isValid = verifyChunkProvenance(selectedDoc, chunk);
              return (
                <Card key={chunk.id} className="text-xs space-y-2">
                  <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between border-b border-[var(--border-color)]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[var(--primary)]">
                        Chunk #{chunk.chunkIndex + 1}
                      </span>
                      {chunk.pageStart && (
                        <span className="px-2 py-0.5 rounded bg-[var(--surface)] text-[10px] text-[var(--text-secondary)]">
                          Page {chunk.pageStart}
                          {chunk.pageEnd && chunk.pageEnd !== chunk.pageStart
                            ? `–${chunk.pageEnd}`
                            : ''}
                        </span>
                      )}
                      {chunk.headingPath && chunk.headingPath.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-[var(--surface)] text-[10px] text-[var(--text-secondary)] truncate max-w-xs">
                          {chunk.headingPath.join(' › ')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">
                        [{chunk.startOffset}..{chunk.endOffset}]
                      </span>
                      {isValid ? (
                        <span
                          title="Mathematically proven: doc.extractedText.slice(start, end) === chunk.text"
                          className="flex items-center gap-1 text-[10px] font-medium text-[var(--success)]"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Proven</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--danger)]">
                          <ShieldAlert className="h-3 w-3" />
                          <span>Corrupt Offset</span>
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 py-3">
                    <p className="font-sans text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed select-text">
                      {chunk.text}
                    </p>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: Extracted Concepts View */}
      {previewTab === 'concepts' && (
        <div className="space-y-4">
          {extractedConcepts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <Sparkles className="h-8 w-8 text-[var(--primary)] mx-auto opacity-70" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  No concepts extracted yet
                </p>
                <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                  Click the &quot;Analyze notes&quot; button above to extract teachable concepts, key
                  terms, and prerequisite relationships using Gemini.
                </p>
                <Button variant="primary" size="sm" onClick={onAnalyzeNotes} disabled={isAnalyzing}>
                  Analyze notes now
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {extractedConcepts.map((concept) => (
                <Card key={concept.id} className="overflow-hidden border border-[var(--border-color)]">
                  <CardHeader className="py-3 px-4 sm:px-6 bg-[var(--surface-raised)]/40 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-[var(--text-primary)]">
                        {concept.title}
                      </h3>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--accent-blue)] border border-[var(--border-color)]">
                        {concept.tier === 0
                          ? 'Tier 0: Foundational'
                          : concept.tier === 1
                          ? 'Tier 1: Core'
                          : 'Tier 2: Advanced'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--success)]/15 border border-[var(--success)]/30 text-[var(--success)]"
                        title="Model extraction confidence"
                      >
                        {Math.round(concept.confidence * 100)}% confidence
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 sm:p-6 space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Summary
                      </p>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        {concept.summary}
                      </p>
                    </div>

                    {concept.canonicalExplanation && (
                      <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border-color)]">
                        <p className="text-xs font-semibold text-[var(--accent-blue)] mb-1">
                          Canonical Explanation
                        </p>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                          {concept.canonicalExplanation}
                        </p>
                      </div>
                    )}

                    {concept.keyTerms && concept.keyTerms.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          <span>Key Terms</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {concept.keyTerms.map((term, i) => (
                            <span
                              key={i}
                              className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--surface-raised)] border border-[var(--border-color)] text-[var(--text-secondary)]"
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Source citations provenance viewer */}
                    <div className="pt-2 border-t border-[var(--border-color)]/60 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      <Quote className="h-3.5 w-3.5 text-[var(--primary)]" />
                      <span>Grounded in chunks:</span>
                      {concept.sourceChunkIds.map((cid) => {
                        const chunk = selectedDocChunks.find((c) => c.id === cid);
                        const label = chunk ? `Chunk #${chunk.chunkIndex + 1}` : 'Chunk';
                        return (
                          <button
                            key={cid}
                            type="button"
                            onClick={() => onOpenExcerpt(concept, cid)}
                            className="px-2 py-0.5 rounded bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border-color)] text-[var(--primary)] font-mono text-[10px] cursor-pointer transition-colors"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Learning Units View */}
      {previewTab === 'units' && (
        <div className="space-y-4">
          {selectedDocUnits.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <Layers className="h-8 w-8 text-[var(--primary)] mx-auto opacity-70" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  No learning units created yet
                </p>
                <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                  Analyze your notes to automatically synthesize concepts into structured learning
                  units.
                </p>
                <Button variant="primary" size="sm" onClick={onAnalyzeNotes} disabled={isAnalyzing}>
                  Analyze notes to build units
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {selectedDocUnits.map((unit) => {
                const unitConcepts = extractedConcepts.filter((c) =>
                  unit.conceptIds.includes(c.id),
                );
                return (
                  <Card key={unit.id} className="overflow-hidden border border-[var(--border-color)]">
                    <CardHeader className="py-3 px-4 sm:px-6 bg-[var(--surface-raised)]/40 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)]">
                          Unit #{unit.order + 1}
                        </span>
                        <h3 className="text-base font-bold text-[var(--text-primary)]">
                          {unit.title}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-muted)]">
                        v:{unit.contentVersion.slice(0, 8)}
                      </span>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 space-y-3">
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        {unit.summary}
                      </p>
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                          Concepts in this Unit ({unit.conceptIds.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {unitConcepts.map((c) => (
                            <span
                              key={c.id}
                              className="text-xs px-2.5 py-1 rounded-md bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-primary)]"
                            >
                              {c.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
